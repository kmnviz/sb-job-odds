import axios, {AxiosError} from 'axios';
import {env} from '../../config/env.js';
import logger from '../../services/logger.js';

interface SportmonksOdd {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  name: string | null;
  probability: string;
  stopped: boolean;
  total: string | null;
  handicap: string | null;
}

interface SportmonksFixtureWithOdds {
  id: number;
  odds?: SportmonksOdd[];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class SportmonksOddsClient {
  private readonly maxAttempts = 6;

  async getFixturesWithOdds(params: {
    runId: string;
    fixtureProviderIds: string[];
    bookmakerProviderId: string;
    marketProviderId: number;
    batchSize: number;
  }): Promise<SportmonksFixtureWithOdds[]> {
    const numericFixtureIds = params.fixtureProviderIds
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);

    const batches = chunkArray(numericFixtureIds, params.batchSize);
    const allFixtures: SportmonksFixtureWithOdds[] = [];

    logger.info('Sportmonks fixtures-with-odds fetch started', {
      runId: params.runId,
      requestedFixtureIds: params.fixtureProviderIds.length,
      validNumericFixtureIds: numericFixtureIds.length,
      batchSize: params.batchSize,
      batches: batches.length,
      bookmakerProviderId: params.bookmakerProviderId,
      marketProviderId: params.marketProviderId,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const startedAt = Date.now();
      const fixtures = await this.fetchBatch({
        runId: params.runId,
        batchIndex: i + 1,
        totalBatches: batches.length,
        fixtureIds: batch,
        bookmakerProviderId: params.bookmakerProviderId,
        marketProviderId: params.marketProviderId,
      });
      allFixtures.push(...fixtures);

      const returnedOdds = fixtures.reduce(
        (acc, fixture) => acc + (fixture.odds?.length ?? 0),
        0
      );
      logger.debug('Sportmonks fixtures-with-odds batch completed', {
        runId: params.runId,
        batchIndex: i + 1,
        totalBatches: batches.length,
        requestedFixtureIds: batch.length,
        returnedFixtures: fixtures.length,
        returnedOdds,
        elapsedMs: Date.now() - startedAt,
      });
    }

    const totalOdds = allFixtures.reduce(
      (acc, fixture) => acc + (fixture.odds?.length ?? 0),
      0
    );
    logger.info('Sportmonks fixtures-with-odds fetch finished', {
      runId: params.runId,
      returnedFixtures: allFixtures.length,
      returnedOdds: totalOdds,
    });

    return allFixtures;
  }

  private async fetchBatch(params: {
    runId: string;
    batchIndex: number;
    totalBatches: number;
    fixtureIds: number[];
    bookmakerProviderId: string;
    marketProviderId: number;
  }): Promise<SportmonksFixtureWithOdds[]> {
    const idsSegment = params.fixtureIds.join(',');
    const url = new URL(`/api/fixtures/multi/${idsSegment}`, env.SM_API_BASE_URL);
    url.searchParams.set('include', 'odds');
    url.searchParams.set(
      'filters',
      `bookmakers:${params.bookmakerProviderId};markets:${params.marketProviderId}`
    );

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        logger.debug('sm-api fixtures batch request', {
          runId: params.runId,
          batchIndex: params.batchIndex,
          totalBatches: params.totalBatches,
          attempt: attempt + 1,
          fixtureIds: params.fixtureIds.length,
          url: url.toString(),
        });
        const response = await axios.get<SportmonksFixtureWithOdds[]>(
          url.toString(),
          {timeout: 30000}
        );
        return Array.isArray(response.data) ? response.data : [];
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const isRetryable =
          !axiosError.response || status === 429 || status === 502 || status === 503;

        if (!isRetryable || attempt === this.maxAttempts - 1) {
          throw error;
        }

        const waitMs = 1000 * 2 ** attempt;
        logger.warn('sm-api batch request failed, retrying', {
          runId: params.runId,
          batchIndex: params.batchIndex,
          totalBatches: params.totalBatches,
          status,
          attempt: attempt + 1,
          waitMs,
        });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    return [];
  }
}
