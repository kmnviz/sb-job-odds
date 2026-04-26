# Set your tag and vars
export TAG=1.0.5
export GCP_PROJECT_ID="kmnviz"
export REGION="europe-west1"

# build the app
npm run build

# Build for Cloud Run (amd64)
docker build --platform linux/amd64 -t $REGION-docker.pkg.dev/$GCP_PROJECT_ID/sb-job-odds/app:$TAG .

# Activate service account
gcloud auth activate-service-account --key-file=../gcp-service-accounts/artifact-pusher.json

# Push image
docker push $REGION-docker.pkg.dev/$GCP_PROJECT_ID/sb-job-odds/app:$TAG

# Activate deployer account
gcloud auth login
gcloud config set project $GCP_PROJECT_ID

# Deploy Cloud Run service
gcloud run deploy sb-job-odds \
  --image=$REGION-docker.pkg.dev/$GCP_PROJECT_ID/sb-job-odds/app:$TAG \
  --region=$REGION

# Initial setup: create Artifact Registry repo
gcloud artifacts repositories create sb-job-odds \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for sb-job-odds"

# Allow image push from artifact-pusher service account
gcloud artifacts repositories add-iam-policy-binding sb-job-odds \
  --location=$REGION \
  --member="serviceAccount:artifact-pusher@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" \
  --project=$GCP_PROJECT_ID

# Grant Cloud Scheduler invoker rights
gcloud run services add-iam-policy-binding sb-job-odds \
  --region=$REGION \
  --member="serviceAccount:scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

export SERVICE_URL=$(gcloud run services describe sb-job-odds --region=$REGION --format='value(status.url)')

# Hourly scheduler for polling odds (transitional alias; delete after cutover)
gcloud scheduler jobs create http sb-job-odds-hourly \
  --location=$REGION \
  --schedule="0 * * * *" \
  --time-zone="UTC" \
  --http-method=POST \
  --uri="${SERVICE_URL}/run" \
  --headers="Content-Type=application/json" \
  --message-body='{"mode":"hourly"}' \
  --oidc-service-account-email="scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${SERVICE_URL}"

# Hourly scheduler for capturing pre-match odds snapshots (canonical mode).
# Polls Sportmonks for the configured market on all pending matches kicking
# off in the next fixturesWindowHours and appends rows to `odds_snapshots`.
# Payload is self-describing (market + bookmaker + window). fixturesBatchSize
# is left to env (FIXTURES_BATCH_SIZE) as a tuning knob.
gcloud scheduler jobs create http sb-job-odds-snapshots-hourly \
  --location=$REGION \
  --schedule="0 * * * *" \
  --time-zone="UTC" \
  --http-method=POST \
  --uri="${SERVICE_URL}/run" \
  --headers="Content-Type=application/json" \
  --message-body='{"mode":"odds_snapshots_hourly","config":{"markets":["asian_handicap"],"targetBookmakerName":"Pinnacle","fixturesWindowHours":24}}' \
  --oidc-service-account-email="scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${SERVICE_URL}"

# 1-minute scheduler for resolving closing odds (payload-driven config).
# Window defaults to upcomingWindowMinutes=2 → each match gets ~2 attempts
# in [KO-2min, KO] before being frozen by the unique compound index.
gcloud scheduler jobs create http sb-job-odds-closing-1min \
  --location=$REGION \
  --schedule="* * * * *" \
  --time-zone="UTC" \
  --http-method=POST \
  --uri="${SERVICE_URL}/run" \
  --headers="Content-Type=application/json" \
  --message-body='{"mode":"closing_odds_1min","config":{"markets":["full_time_result"],"targetBookmakerName":"Pinnacle"}}' \
  --oidc-service-account-email="scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${SERVICE_URL}"

# Cutover (after verifying the new schedulers run green):
#   gcloud scheduler jobs delete sb-job-odds-hourly --location=$REGION
# Then drop the 'hourly' alias from server.ts in a follow-up deploy.

## Initial deployment
gcloud run deploy sb-job-odds \
  --image=$REGION-docker.pkg.dev/$GCP_PROJECT_ID/sb-job-odds/app:$TAG \
  --region=$REGION \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="LOG_LEVEL=info" \
  --set-env-vars="MONGODB_URI=" \
  --set-env-vars="SM_API_BASE_URL=https://sm-api.smartbettors.xyz" \
  --set-env-vars="FIXTURES_BATCH_SIZE=25" \
  --set-env-vars="FIXTURES_WINDOW_HOURS=24" \
  --set-env-vars="TARGET_BOOKMAKER_NAME=Pinnacle"