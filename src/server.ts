import express, {Request, Response} from 'express';
import {z} from 'zod';
import {connectDatabase, disconnectDatabase} from './config/database.js';
import {env} from './config/env.js';
import {pollOdds} from './services/poll-odds.service.js';
import logger from './services/logger.js';

const app = express();
const PORT = env.APP_PORT;

app.use(express.json());

connectDatabase().catch((error) => {
  logger.error('Failed to connect to MongoDB on startup', {
    error:
      error instanceof Error ? error.stack || error.message : String(error),
  });
  process.exit(1);
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({status: 'ok'});
});

type RunMode = 'hourly';

const runBodySchema = z
  .object({
    mode: z.enum(['hourly'] as [RunMode, ...RunMode[]]),
  })
  .strict();

app.post('/run', async (req: Request, res: Response) => {
  try {
    const parsedBody = runBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        status: 'error',
        message: 'Missing or invalid mode. Allowed values: hourly',
        details: parsedBody.error.flatten(),
      });
      return;
    }

    const {mode} = parsedBody.data;
    void mode;
    const result = await pollOdds();
    res.status(200).json({status: 'completed', ...result});
  } catch (error) {
    logger.error('Poll-odds run endpoint failed', {
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT}`);
});

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await disconnectDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
