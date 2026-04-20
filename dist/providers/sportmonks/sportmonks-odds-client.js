import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../services/logger.js';
function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
export class SportmonksOddsClient {
    maxAttempts = 6;
    async getFixturesWithOdds(params) {
        const numericFixtureIds = params.fixtureProviderIds
            .map((id) => parseInt(id, 10))
            .filter((id) => Number.isInteger(id) && id > 0);
        const batches = chunkArray(numericFixtureIds, params.batchSize);
        const allFixtures = [];
        for (const batch of batches) {
            const fixtures = await this.fetchBatch({
                fixtureIds: batch,
                bookmakerProviderId: params.bookmakerProviderId,
                marketProviderId: params.marketProviderId,
            });
            allFixtures.push(...fixtures);
        }
        return allFixtures;
    }
    async fetchBatch(params) {
        const idsSegment = params.fixtureIds.join(',');
        const url = new URL(`/api/fixtures/multi/${idsSegment}`, env.SM_API_BASE_URL);
        url.searchParams.set('include', 'odds');
        url.searchParams.set('filters', `bookmakers:${params.bookmakerProviderId};markets:${params.marketProviderId}`);
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await axios.get(url.toString(), { timeout: 30000 });
                return Array.isArray(response.data) ? response.data : [];
            }
            catch (error) {
                const axiosError = error;
                const status = axiosError.response?.status;
                const isRetryable = !axiosError.response || status === 429 || status === 502 || status === 503;
                if (!isRetryable || attempt === this.maxAttempts - 1) {
                    throw error;
                }
                const waitMs = 1000 * 2 ** attempt;
                logger.warn('sm-api batch request failed, retrying', {
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
//# sourceMappingURL=sportmonks-odds-client.js.map