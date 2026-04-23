import mongoose, {Types} from 'mongoose';
import ClosingOddsModel from '../models/closing-odds.model.js';
import OddsSnapshotModel from '../models/odds-snapshot.model.js';
import type {OddsSnapshotDocument} from '../models/odds-snapshot.model.js';
import type {MarketType} from '../types/market.js';
import {buildClosingOdds} from './closing-odds-builder.js';
import logger from './logger.js';

export interface ResolveClosingOddsConfig {
  markets: MarketType[];
  targetBookmakerName: string;
  recentWindowHours: number;
  batchSize: number;
}

export interface ResolveClosingOddsSummary {
  matchesEvaluated: number;
  matchesWithSnapshots: number;
  selectionsResolved: number;
  selectionsMissingSource: number;
  rowsInserted: number;
  rowsAlreadyPresent: number;
  errors: number;
}

interface DbMatch {
  _id: Types.ObjectId;
  kickoffUTC: string;
  status?: string;
  providers?: {sportmonks?: {id?: string}};
}

interface DbBookmaker {
  _id: Types.ObjectId;
  name: string;
}

interface DbMarket {
  _id: Types.ObjectId;
  type: MarketType;
  name: string;
  outcomes: string[];
}

const EMPTY_SUMMARY: ResolveClosingOddsSummary = {
  matchesEvaluated: 0,
  matchesWithSnapshots: 0,
  selectionsResolved: 0,
  selectionsMissingSource: 0,
  rowsInserted: 0,
  rowsAlreadyPresent: 0,
  errors: 0,
};

export async function resolveClosingOdds(
  config: ResolveClosingOddsConfig
): Promise<ResolveClosingOddsSummary> {
  const runId = crypto.randomUUID();
  logger.info('Closing odds resolve run started', {runId, config});

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not available');
  }

  const now = new Date();
  const resolveUpper = now;
  const resolveLower = new Date(
    now.getTime() - config.recentWindowHours * 60 * 60 * 1000
  );

  const bookmaker = await db
    .collection<DbBookmaker>('bookmakers')
    .findOne({name: config.targetBookmakerName});
  if (!bookmaker) {
    throw new Error(`Bookmaker not found: ${config.targetBookmakerName}`);
  }

  const marketDocs = await db
    .collection<DbMarket>('markets')
    .find({type: {$in: config.markets}})
    .toArray();
  const marketDocByType = new Map<MarketType, DbMarket>();
  for (const doc of marketDocs) {
    marketDocByType.set(doc.type, doc);
  }

  const missingMarkets = config.markets.filter(
    (type) => !marketDocByType.has(type)
  );
  if (missingMarkets.length > 0) {
    logger.warn('Closing odds: some markets not found in DB', {
      runId,
      missingMarkets,
    });
  }

  const matches = await db
    .collection<DbMatch>('matches')
    .find({
      kickoffUTC: {
        $gte: resolveLower.toISOString(),
        $lte: resolveUpper.toISOString(),
      },
    })
    .project({_id: 1, kickoffUTC: 1, status: 1, providers: 1})
    .toArray();

  logger.info('Closing odds: matches loaded', {
    runId,
    matchesFound: matches.length,
    resolveLower: resolveLower.toISOString(),
    resolveUpper: resolveUpper.toISOString(),
  });

  const summary: ResolveClosingOddsSummary = {...EMPTY_SUMMARY};
  summary.matchesEvaluated = matches.length;

  const matchesWithAnySnapshot = new Set<string>();

  for (let start = 0; start < matches.length; start += config.batchSize) {
    const batch = matches.slice(start, start + config.batchSize);
    for (const match of batch) {
      const kickoffUtc = new Date(match.kickoffUTC);
      for (const marketType of config.markets) {
        const marketDoc = marketDocByType.get(marketType);
        if (!marketDoc) {
          continue;
        }
        try {
          const resolved = await resolveMatchMarket({
            matchId: match._id,
            marketType,
            bookmakerId: bookmaker._id,
            kickoffUtc,
          });

          if (resolved.selections.length === 0) {
            summary.selectionsMissingSource += resolved.expectedSelections;
            continue;
          }

          matchesWithAnySnapshot.add(match._id.toString());

          for (const snapshot of resolved.selections) {
            summary.selectionsResolved += 1;
            const doc = buildClosingOdds({
              sourceSnapshot: snapshot,
              kickoffUtc,
              resolvedAt: now,
            });
            try {
              const result = await ClosingOddsModel.updateOne(
                {
                  match_id: doc.match_id,
                  market_type: doc.market_type,
                  bookmaker_id: doc.bookmaker_id,
                  outcome: doc.outcome,
                },
                {$setOnInsert: doc},
                {upsert: true}
              );
              if (result.upsertedCount && result.upsertedCount > 0) {
                summary.rowsInserted += 1;
              } else {
                summary.rowsAlreadyPresent += 1;
              }
            } catch (error) {
              summary.errors += 1;
              logger.error('Closing odds upsert failed', {
                runId,
                matchId: match._id.toString(),
                marketType,
                outcome: doc.outcome,
                error:
                  error instanceof Error
                    ? error.stack || error.message
                    : String(error),
              });
            }
          }
        } catch (error) {
          summary.errors += 1;
          logger.error('Closing odds: per-match resolution failed', {
            runId,
            matchId: match._id.toString(),
            marketType,
            error:
              error instanceof Error
                ? error.stack || error.message
                : String(error),
          });
        }
      }
    }
  }

  summary.matchesWithSnapshots = matchesWithAnySnapshot.size;

  logger.info('Closing odds resolve run finished', {runId, ...summary});
  return summary;
}

interface ResolvedMatchMarket {
  selections: OddsSnapshotDocument[];
  expectedSelections: number;
}

interface ResolveMatchMarketParams {
  matchId: Types.ObjectId;
  marketType: MarketType;
  bookmakerId: Types.ObjectId;
  kickoffUtc: Date;
}

async function resolveMatchMarket(
  params: ResolveMatchMarketParams
): Promise<ResolvedMatchMarket> {
  if (params.marketType === 'asian_handicap') {
    return resolveAsianHandicapMainLine(params);
  }
  return resolveLineLess(params);
}

async function resolveLineLess(
  params: ResolveMatchMarketParams
): Promise<ResolvedMatchMarket> {
  const baseFilter = {
    match_id: params.matchId,
    market_type: params.marketType,
    bookmaker_id: params.bookmakerId,
    captured_at: {$lte: params.kickoffUtc},
  };

  const snapshots = await OddsSnapshotModel.find(baseFilter)
    .sort({captured_at: -1})
    .lean<OddsSnapshotDocument[]>()
    .exec();

  if (snapshots.length === 0) {
    return {selections: [], expectedSelections: 0};
  }

  const latestByOutcome = new Map<string, OddsSnapshotDocument>();
  const latestNonStoppedByOutcome = new Map<string, OddsSnapshotDocument>();

  for (const snapshot of snapshots) {
    if (!latestByOutcome.has(snapshot.outcome)) {
      latestByOutcome.set(snapshot.outcome, snapshot);
    }
    if (
      !snapshot.stopped &&
      !latestNonStoppedByOutcome.has(snapshot.outcome)
    ) {
      latestNonStoppedByOutcome.set(snapshot.outcome, snapshot);
    }
  }

  const selections: OddsSnapshotDocument[] = [];
  for (const [outcome, anySnapshot] of latestByOutcome) {
    const preferred = latestNonStoppedByOutcome.get(outcome) ?? anySnapshot;
    selections.push(preferred);
  }

  return {
    selections,
    expectedSelections: latestByOutcome.size,
  };
}

async function resolveAsianHandicapMainLine(
  params: ResolveMatchMarketParams
): Promise<ResolvedMatchMarket> {
  const baseFilter = {
    match_id: params.matchId,
    market_type: params.marketType,
    bookmaker_id: params.bookmakerId,
    captured_at: {$lte: params.kickoffUtc},
  };

  const latestNonStopped = await OddsSnapshotModel.find({
    ...baseFilter,
    stopped: false,
  })
    .sort({captured_at: -1})
    .limit(1)
    .lean<OddsSnapshotDocument[]>()
    .exec();

  let anchorCapturedAt: Date | null =
    latestNonStopped.length > 0 ? latestNonStopped[0].captured_at : null;

  if (anchorCapturedAt == null) {
    const latestAny = await OddsSnapshotModel.find(baseFilter)
      .sort({captured_at: -1})
      .limit(1)
      .lean<OddsSnapshotDocument[]>()
      .exec();
    anchorCapturedAt = latestAny.length > 0 ? latestAny[0].captured_at : null;
  }

  if (anchorCapturedAt == null) {
    return {selections: [], expectedSelections: 2};
  }

  const snapshotsAtAnchor = await OddsSnapshotModel.find({
    ...baseFilter,
    captured_at: anchorCapturedAt,
  })
    .lean<OddsSnapshotDocument[]>()
    .exec();

  const byLine = new Map<
    string,
    {home?: OddsSnapshotDocument; away?: OddsSnapshotDocument}
  >();
  for (const snapshot of snapshotsAtAnchor) {
    const lineKey = snapshot.line ?? '';
    const entry = byLine.get(lineKey) ?? {};
    if (snapshot.outcome === 'home') {
      entry.home = snapshot;
    } else if (snapshot.outcome === 'away') {
      entry.away = snapshot;
    }
    byLine.set(lineKey, entry);
  }

  let bestLineKey: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [lineKey, pair] of byLine) {
    if (!pair.home || !pair.away) {
      continue;
    }
    const homeOdds = Number(pair.home.odds_decimal);
    const awayOdds = Number(pair.away.odds_decimal);
    if (!Number.isFinite(homeOdds) || !Number.isFinite(awayOdds)) {
      continue;
    }
    const diff = Math.abs(homeOdds - awayOdds);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestLineKey = lineKey;
    }
  }

  if (bestLineKey == null) {
    return {selections: [], expectedSelections: 2};
  }

  const pair = byLine.get(bestLineKey)!;
  return {
    selections: [pair.home!, pair.away!],
    expectedSelections: 2,
  };
}
