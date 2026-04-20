# Set your tag and vars
export TAG=1.0.0
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

# Hourly scheduler for polling odds
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
