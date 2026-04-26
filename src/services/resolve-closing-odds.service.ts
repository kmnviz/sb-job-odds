import mongoose, {Types} from 'mongoose';
import {getSportmonksBookmakerIdByName} from '../config/sportmonks-bookmaker.mapping.js';
import ClosingOddsModel from '../models/closing-odds.model.js';
import {SportmonksOddsClient} from '../providers/sportmonks/sportmonks-odds-client.js';
import {SportmonksOddsProvider} from '../providers/sportmonks/sportmonks-odds-provider.js';
import type {FetchedOdd} from '../types/odds-provider.js';
import type {MarketType} from '../types/market.js';
import {buildClosingOdds} from './closing-odds-builder.js';
import logger from './logger.js';

export interface ResolveClosingOddsConfig {
  markets: MarketType[];
  targetBookmakerName: string;
  upcomingWindowMinutes: number;
  batchSize: number;
}

export interface ResolveClosingOddsSummary {
  matchesEvaluated: number;
  matchesSkippedAlreadyDone: number;
  matchesFetched: number;
  selectionsResolved: number;
  selectionsMissingSource: number;
  rowsInserted: number;
  rowsUpgradedFromStopped: number;
  rowsAlreadyPresent: number;
  providerErrors: number;
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
}

const EXPECTED_OUTCOMES_PER_MARKET: Record<MarketType, number> = {
  full_time_result: 3,
  over_under_25: 2,
  both_teams_to_score: 2,
  asian_handicap: 2,
};

const EMPTY_SUMMARY: ResolveClosingOddsSummary = {
  matchesEvaluated: 0,
  matchesSkippedAlreadyDone: 0,
  matchesFetched: 0,
  selectionsResolved: 0,
  selectionsMissingSource: 0,
  rowsInserted: 0,
  rowsUpgradedFromStopped: 0,
  rowsAlreadyPresent: 0,
  providerErrors: 0,
  errors: 0,
};

export async function resolveClosingOdds(
  config: ResolveClosingOddsConfig
): Promise<ResolveClosingOddsSummary> {
  const runId = crypto.randomUUID();
  logger.info('Closing odds resolve run started', {runId, config});

  if (config.markets.length !== 1) {
    throw new Error(
      `Closing odds v1 supports exactly one market per job. Got: ${config.markets.join(',')}`
    );
  }
  const marketType: MarketType = config.markets[0];

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not available');
  }

  const now = new Date();
  const windowStart = now;
  const windowEnd = new Date(
    now.getTime() + config.upcomingWindowMinutes * 60 * 1000
  );

  const [bookmaker, marketDoc] = await Promise.all([
    db
      .collection<DbBookmaker>('bookmakers')
      .findOne({name: config.targetBookmakerName}),
    db.collection<DbMarket>('markets').findOne({type: marketType}),
  ]);

  if (!bookmaker) {
    throw new Error(`Bookmaker not found: ${config.targetBookmakerName}`);
  }
  if (!marketDoc) {
    throw new Error(`Market not found: ${marketType}`);
  }

  const bookmakerProviderId = getSportmonksBookmakerIdByName(bookmaker.name);
  if (bookmakerProviderId == null) {
    throw new Error(`No Sportmonks mapping for bookmaker: ${bookmaker.name}`);
  }

  const matches = await db
    .collection<DbMatch>('matches')
    .find(
      {
        kickoffUTC: {
          $gte: windowStart.toISOString(),
          $lte: windowEnd.toISOString(),
        },
        'providers.sportmonks.id': {$exists: true, $ne: null},
      },
      {projection: {_id: 1, kickoffUTC: 1, status: 1, providers: 1}}
    )
    .toArray();

  logger.info('Closing odds: matches loaded', {
    runId,
    matchesFound: matches.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  const summary: ResolveClosingOddsSummary = {...EMPTY_SUMMARY};
  summary.matchesEvaluated = matches.length;

  if (matches.length === 0) {
    logger.info('Closing odds resolve run finished (no matches)', {
      runId,
      ...summary,
    });
    return summary;
  }

  const matchIds = matches.map((match) => match._id);
  const expectedOutcomes = EXPECTED_OUTCOMES_PER_MARKET[marketType];
  const fullyResolvedRows = await ClosingOddsModel.aggregate<{
    _id: Types.ObjectId;
    cnt: number;
  }>([
    {
      $match: {
        match_id: {$in: matchIds},
        market_type: marketType,
        bookmaker_id: bookmaker._id,
        stopped: false,
      },
    },
    {$group: {_id: '$match_id', cnt: {$sum: 1}}},
    {$match: {cnt: {$gte: expectedOutcomes}}},
  ]).exec();

  const fullyResolvedSet = new Set(
    fullyResolvedRows.map((row) => row._id.toString())
  );

  const pendingMatches = matches.filter(
    (match) => !fullyResolvedSet.has(match._id.toString())
  );
  summary.matchesSkippedAlreadyDone =
    matches.length - pendingMatches.length;

  logger.info('Closing odds: pending after pre-skip', {
    runId,
    pending: pendingMatches.length,
    skippedAlreadyDone: summary.matchesSkippedAlreadyDone,
  });

  if (pendingMatches.length === 0) {
    logger.info('Closing odds resolve run finished (all already resolved)', {
      runId,
      ...summary,
    });
    return summary;
  }

  const matchByFixtureProviderId = new Map<string, DbMatch>();
  for (const match of pendingMatches) {
    const fixtureProviderId = match.providers?.sportmonks?.id;
    if (fixtureProviderId) {
      matchByFixtureProviderId.set(fixtureProviderId, match);
    }
  }
  const fixtureProviderIds = Array.from(matchByFixtureProviderId.keys());

  const provider = new SportmonksOddsProvider(new SportmonksOddsClient());
  let fetchedByFixture: Awaited<
    ReturnType<typeof provider.fetchOddsByFixtures>
  > = [];
  try {
    fetchedByFixture = await provider.fetchOddsByFixtures({
      runId,
      fixtureProviderIds,
      marketType,
      bookmakerProviderId: String(bookmakerProviderId),
      batchSize: config.batchSize,
    });
    logger.info('Closing odds: sportmonks fetch complete', {
      runId,
      fixturesRequested: fixtureProviderIds.length,
      fixturesReturned: fetchedByFixture.length,
    });
  } catch (error) {
    summary.providerErrors += 1;
    logger.error('Closing odds: sportmonks fetch failed (all)', {
      runId,
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    logger.info('Closing odds resolve run finished with provider error', {
      runId,
      ...summary,
    });
    return summary;
  }

  summary.matchesFetched = fixtureProviderIds.length;

  for (const fixtureOdds of fetchedByFixture) {
    const match = matchByFixtureProviderId.get(fixtureOdds.fixtureProviderId);
    if (!match) {
      continue;
    }

    let selections: FetchedOdd[];
    try {
      selections =
        marketType === 'asian_handicap'
          ? pickAsianHandicapMainLine(fixtureOdds.odds)
          : pickLineLess(fixtureOdds.odds);
    } catch (error) {
      summary.errors += 1;
      logger.error('Closing odds: selection rule failed', {
        runId,
        matchId: match._id.toString(),
        marketType,
        error:
          error instanceof Error
            ? error.stack || error.message
            : String(error),
      });
      continue;
    }

    if (selections.length === 0) {
      summary.selectionsMissingSource += 1;
      logger.warn('Closing odds: no valid selections for match', {
        runId,
        matchId: match._id.toString(),
        marketType,
        returnedOdds: fixtureOdds.odds.length,
      });
      continue;
    }

    for (const selection of selections) {
      summary.selectionsResolved += 1;
      const doc = buildClosingOdds({
        fetchedOdd: selection,
        matchId: match._id,
        marketId: marketDoc._id,
        marketType,
        bookmakerId: bookmaker._id,
        bookmakerName: bookmaker.name,
        capturedAt: now,
      });
      try {
        let upgraded = false;
        if (!doc.stopped) {
          const upgradeResult = await ClosingOddsModel.updateOne(
            {
              match_id: doc.match_id,
              market_type: doc.market_type,
              bookmaker_id: doc.bookmaker_id,
              outcome: doc.outcome,
              stopped: true,
            },
            {$set: doc}
          );
          upgraded = (upgradeResult.modifiedCount ?? 0) > 0;
        }

        if (upgraded) {
          summary.rowsUpgradedFromStopped += 1;
        } else {
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
        }
      } catch (error) {
        summary.errors += 1;
        logger.error('Closing odds: upsert failed', {
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
  }

  logger.info('Closing odds resolve run finished', {runId, ...summary});
  return summary;
}

function pickLineLess(odds: FetchedOdd[]): FetchedOdd[] {
  const activeByOutcome = new Map<string, FetchedOdd>();
  const stoppedByOutcome = new Map<string, FetchedOdd>();
  for (const odd of odds) {
    const bucket = odd.stopped ? stoppedByOutcome : activeByOutcome;
    if (!bucket.has(odd.outcome)) {
      bucket.set(odd.outcome, odd);
    }
  }
  const merged = new Map<string, FetchedOdd>(activeByOutcome);
  for (const [outcome, odd] of stoppedByOutcome) {
    if (!merged.has(outcome)) {
      merged.set(outcome, odd);
    }
  }
  return Array.from(merged.values());
}

function pickAsianHandicapMainLine(odds: FetchedOdd[]): FetchedOdd[] {
  const byLine = new Map<
    string,
    {home?: FetchedOdd; away?: FetchedOdd}
  >();

  for (const odd of odds) {
    if (odd.stopped) continue;
    const lineKey = odd.line ?? '';
    const entry = byLine.get(lineKey) ?? {};
    if (odd.outcome === 'home' && !entry.home) {
      entry.home = odd;
    } else if (odd.outcome === 'away' && !entry.away) {
      entry.away = odd;
    }
    byLine.set(lineKey, entry);
  }

  let bestLineKey: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [lineKey, pair] of byLine) {
    if (!pair.home || !pair.away) continue;
    const homeOdds = Number(pair.home.odds_decimal);
    const awayOdds = Number(pair.away.odds_decimal);
    if (!Number.isFinite(homeOdds) || !Number.isFinite(awayOdds)) continue;
    const diff = Math.abs(homeOdds - awayOdds);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestLineKey = lineKey;
    }
  }

  if (bestLineKey == null) return [];
  const pair = byLine.get(bestLineKey)!;
  return [pair.home!, pair.away!];
}
