import {connectDatabase, disconnectDatabase} from './config/database.js';
import {pollOdds} from './services/poll-odds.service.js';
import logger from './services/logger.js';

async function run() {
  try {
    await connectDatabase();
    const result = await pollOdds();
    logger.info('Poll-odds job finished', result);
  } catch (error) {
    logger.error('Poll-odds job failed', {
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

run();
