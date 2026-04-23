import {connectDatabase, disconnectDatabase} from './config/database.js';
import {captureOddsSnapshots} from './services/capture-odds-snapshots.service.js';
import {
  resolveClosingOdds,
  type ResolveClosingOddsConfig,
} from './services/resolve-closing-odds.service.js';
import type {MarketType} from './types/market.js';
import logger from './services/logger.js';

type JobMode = 'odds_snapshots_hourly' | 'closing_odds_5min';

function parseJobMode(raw: string | undefined): JobMode {
  const value = (raw ?? 'odds_snapshots_hourly').trim();
  if (value === 'odds_snapshots_hourly' || value === 'hourly') {
    if (value === 'hourly') {
      logger.warn('Deprecated JOB_MODE used', {
        deprecatedMode: 'hourly',
        canonicalMode: 'odds_snapshots_hourly',
      });
    }
    return 'odds_snapshots_hourly';
  }
  if (value === 'closing_odds_5min') {
    return 'closing_odds_5min';
  }
  throw new Error(
    `Invalid JOB_MODE: '${value}'. Allowed: odds_snapshots_hourly, closing_odds_5min.`
  );
}

function buildClosingConfigFromEnv(): ResolveClosingOddsConfig {
  const marketsRaw = process.env.CLOSING_MARKETS?.trim();
  const targetBookmakerName = (
    process.env.CLOSING_TARGET_BOOKMAKER_NAME ?? process.env.TARGET_BOOKMAKER_NAME
  )?.trim();

  if (!marketsRaw) {
    throw new Error(
      'Closing mode requires CLOSING_MARKETS env var (comma-separated) for CLI runs.'
    );
  }
  if (!targetBookmakerName) {
    throw new Error(
      'Closing mode requires CLOSING_TARGET_BOOKMAKER_NAME (or TARGET_BOOKMAKER_NAME) env var for CLI runs.'
    );
  }

  const markets = marketsRaw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0) as MarketType[];

  if (markets.length === 0) {
    throw new Error('CLOSING_MARKETS must list at least one market.');
  }

  const recentWindowHours = process.env.CLOSING_RECENT_WINDOW_HOURS
    ? Number(process.env.CLOSING_RECENT_WINDOW_HOURS)
    : 2;
  const batchSize = process.env.CLOSING_BATCH_SIZE
    ? Number(process.env.CLOSING_BATCH_SIZE)
    : 200;

  return {
    markets,
    targetBookmakerName,
    recentWindowHours,
    batchSize,
  };
}

async function run() {
  try {
    await connectDatabase();
    const mode = parseJobMode(process.env.JOB_MODE);

    if (mode === 'closing_odds_5min') {
      const config = buildClosingConfigFromEnv();
      const result = await resolveClosingOdds(config);
      logger.info('Closing odds resolve job finished', result);
    } else {
      const result = await captureOddsSnapshots();
      logger.info('Odds snapshots capture job finished', result);
    }
  } catch (error) {
    logger.error('Job failed', {
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

run();
