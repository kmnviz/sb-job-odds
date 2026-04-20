import mongoose, {Types} from 'mongoose';
import {env} from '../config/env.js';
import {getSportmonksBookmakerIdByName} from '../config/sportmonks-bookmaker.mapping.js';
import OddsSnapshotModel from '../models/odds-snapshot.model.js';
import {SportmonksOddsClient} from '../providers/sportmonks/sportmonks-odds-client.js';
import {SportmonksOddsProvider} from '../providers/sportmonks/sportmonks-odds-provider.js';
import type {FetchedOdd} from '../types/odds-provider.js';
import type {MarketType} from '../types/market.js';
import {buildOddsSnapshot} from './odds-snapshot-builder.js';
import logger from './logger.js';

export interface PollOddsSummary {
  matchesPolled: number;
  oddsFetched: number;
  rowsInserted: number;
  errors: number;
}

interface DbMatch {
  _id: Types.ObjectId;
  kickoffUTC: string;
  status: string;
  providers?: {
    sportmonks?: {id?: string};
  };
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

export async function pollOdds(): Promise<PollOddsSummary> {
  const runId = crypto.randomUUID();
  logger.info('Odds poll run started', {runId});

  const batchSize = env.FIXTURES_BATCH_SIZE;
  const windowHours = env.FIXTURES_WINDOW_HOURS;
  const bookmakerName = env.TARGET_BOOKMAKER_NAME;
  const marketType: MarketType = 'asian_handicap';

  const now = new Date();
  const capturedAt = now;
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  logger.info('Odds poll config resolved', {
    runId,
    marketType,
    bookmakerName,
    batchSize,
    windowHours,
    capturedAt: capturedAt.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not available');
  }

  const [market, bookmaker] = await Promise.all([
    db.collection<DbMarket>('markets').findOne({type: marketType}),
    db.collection<DbBookmaker>('bookmakers').findOne({name: bookmakerName}),
  ]);

  if (!market) {
    throw new Error(`Market not found: ${marketType}`);
  }
  if (!bookmaker) {
    throw new Error(`Bookmaker not found: ${bookmakerName}`);
  }

  const bookmakerProviderId = getSportmonksBookmakerIdByName(bookmaker.name);
  if (bookmakerProviderId == null) {
    throw new Error(`No Sportmonks mapping for bookmaker: ${bookmaker.name}`);
  }

  const matches = await db
    .collection<DbMatch>('matches')
    .find({
      status: 'pending',
      kickoffUTC: {$gte: now.toISOString(), $lte: windowEnd.toISOString()},
      'providers.sportmonks.id': {$exists: true, $ne: null},
    })
    .project({_id: 1, status: 1, kickoffUTC: 1, providers: 1})
    .toArray();
  logger.info('Hot window matches loaded', {
    runId,
    matchesFound: matches.length,
  });

  const fixtureProviderIds = matches
    .map((match) => match.providers?.sportmonks?.id ?? null)
    .filter((id): id is string => Boolean(id));
  logger.info('Fixture provider ids resolved', {
    runId,
    fixtureProviderIds: fixtureProviderIds.length,
  });

  const provider = new SportmonksOddsProvider(new SportmonksOddsClient());

  let errors = 0;
  const fetchedByFixture = new Map<string, FetchedOdd[]>();

  try {
    const fetched = await provider.fetchOddsByFixtures({
      runId,
      fixtureProviderIds,
      marketType,
      bookmakerProviderId: String(bookmakerProviderId),
      batchSize,
    });

    for (const row of fetched) {
      fetchedByFixture.set(row.fixtureProviderId, row.odds);
    }
    const fetchedOdds = fetched.reduce((acc, row) => acc + row.odds.length, 0);
    logger.info('Odds fetched and mapped by fixture', {
      runId,
      fixturesReturned: fetched.length,
      fetchedOdds,
    });
  } catch (error) {
    logger.error('Failed to fetch odds batch', {
      runId,
      error: error instanceof Error ? error.stack || error.message : String(error),
    });
    errors += fixtureProviderIds.length;
  }

  const rowsToInsert = [];
  for (const match of matches) {
    const fixtureProviderId = match.providers?.sportmonks?.id;
    if (!fixtureProviderId) {
      continue;
    }
    const odds = fetchedByFixture.get(fixtureProviderId) ?? [];
    if (odds.length === 0) {
      continue;
    }
    for (const odd of odds) {
      rowsToInsert.push(
        buildOddsSnapshot({
          fetchedOdd: odd,
          matchId: match._id,
          marketId: market._id,
          marketType,
          bookmakerId: bookmaker._id,
          bookmakerName: bookmaker.name,
          capturedAt,
        })
      );
    }
  }
  logger.info('Rows prepared for insert', {
    runId,
    rowsPrepared: rowsToInsert.length,
  });

  let rowsInserted = 0;
  if (rowsToInsert.length > 0) {
    try {
      const result = await OddsSnapshotModel.insertMany(rowsToInsert, {
        ordered: false,
      });
      rowsInserted = result.length;
      logger.info('Odds snapshots insert completed', {
        runId,
        rowsInserted,
      });
    } catch (error) {
      logger.error('Insert odds snapshots failed partially', {
        runId,
        error: error instanceof Error ? error.stack || error.message : String(error),
      });
      errors += 1;
    }
  }

  const summary: PollOddsSummary = {
    matchesPolled: matches.length,
    oddsFetched: rowsToInsert.length,
    rowsInserted,
    errors,
  };

  logger.info('Odds poll run finished', {runId, ...summary});
  return summary;
}
