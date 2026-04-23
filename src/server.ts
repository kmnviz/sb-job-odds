import express, {Request, Response} from 'express';
import {z} from 'zod';
import mongoose from 'mongoose';
import {connectDatabase, disconnectDatabase} from './config/database.js';
import {env} from './config/env.js';
import {captureOddsSnapshots} from './services/capture-odds-snapshots.service.js';
import {resolveClosingOdds} from './services/resolve-closing-odds.service.js';
import logger from './services/logger.js';

const app = express();
const PORT = env.APP_PORT;

app.use(express.json());

app.use((_req: Request, res: Response, next) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      status: 'error',
      message: 'Service not ready: database connection is not established',
    });
    return;
  }
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({status: 'ok'});
});

const marketTypeSchema = z.enum([
  'over_under_25',
  'full_time_result',
  'both_teams_to_score',
  'asian_handicap',
]);

const snapshotsConfigSchema = z
  .object({
    markets: z.array(marketTypeSchema).min(1).optional(),
    fixturesBatchSize: z.number().int().min(1).max(100).optional(),
    fixturesWindowHours: z.number().int().min(1).max(72).optional(),
    targetBookmakerName: z.string().min(1).optional(),
  })
  .strict()
  .optional();

const closingConfigSchema = z
  .object({
    markets: z.array(marketTypeSchema).min(1),
    targetBookmakerName: z.string().min(1),
    recentWindowHours: z.number().int().min(1).max(720).optional(),
    batchSize: z.number().int().min(1).max(2000).optional(),
  })
  .strict();

const runBodySchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('odds_snapshots_hourly'),
      config: snapshotsConfigSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal('hourly'),
      config: snapshotsConfigSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal('closing_odds_5min'),
      config: closingConfigSchema,
    })
    .strict(),
]);

const CLOSING_DEFAULTS = {
  recentWindowHours: 2,
  batchSize: 200,
};

app.post('/run', async (req: Request, res: Response) => {
  try {
    const parsedBody = runBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        status: 'error',
        message:
          'Missing or invalid payload. Allowed modes: odds_snapshots_hourly, closing_odds_5min (hourly accepted as transitional alias).',
        details: parsedBody.error.flatten(),
      });
      return;
    }

    const body = parsedBody.data;

    if (body.mode === 'closing_odds_5min') {
      const effective = {
        markets: body.config.markets,
        targetBookmakerName: body.config.targetBookmakerName,
        recentWindowHours:
          body.config.recentWindowHours ?? CLOSING_DEFAULTS.recentWindowHours,
        batchSize: body.config.batchSize ?? CLOSING_DEFAULTS.batchSize,
      };
      const result = await resolveClosingOdds(effective);
      res.status(200).json({status: 'completed', mode: body.mode, ...result});
      return;
    }

    if (body.mode === 'hourly') {
      logger.warn('Deprecated run mode used', {
        deprecatedMode: 'hourly',
        canonicalMode: 'odds_snapshots_hourly',
      });
    }

    const result = await captureOddsSnapshots(body.config ?? {});
    res.status(200).json({
      status: 'completed',
      mode:
        body.mode === 'hourly' ? 'odds_snapshots_hourly' : body.mode,
      ...result,
    });
  } catch (error) {
    logger.error('Run endpoint failed', {
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

let server: ReturnType<typeof app.listen>;

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server?.close(async () => {
    await disconnectDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function bootstrap() {
  try {
    await connectDatabase();
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to MongoDB on startup', {
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    process.exit(1);
  }
}

bootstrap();
