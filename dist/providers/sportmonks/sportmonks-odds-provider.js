import { getSportmonksMarketId } from '../../config/sportmonks-market.mapping.js';
import { mapAsianHandicapLabelToOutcome } from './label-mapping.js';
export class SportmonksOddsProvider {
    client;
    name = 'sportmonks';
    constructor(client) {
        this.client = client;
    }
    async fetchOddsByFixtures(params) {
        if (params.marketType !== 'asian_handicap') {
            throw new Error(`Unsupported market type for Sportmonks v1 provider: ${params.marketType}`);
        }
        const marketProviderId = getSportmonksMarketId(params.marketType);
        const fixtures = await this.client.getFixturesWithOdds({
            fixtureProviderIds: params.fixtureProviderIds,
            bookmakerProviderId: params.bookmakerProviderId,
            marketProviderId,
            batchSize: params.batchSize,
        });
        return fixtures.map((fixture) => ({
            fixtureProviderId: String(fixture.id),
            odds: (fixture.odds ?? [])
                .filter((odd) => String(odd.bookmaker_id) === params.bookmakerProviderId &&
                odd.market_id === marketProviderId)
                .map((odd) => ({
                outcome: mapAsianHandicapLabelToOutcome(odd.label),
                line: odd.handicap,
                team: null,
                odds_decimal: odd.value,
                implied_probability: odd.probability ?? null,
                stopped: odd.stopped,
                provider_odd_id: String(odd.id),
            })),
        }));
    }
}
//# sourceMappingURL=sportmonks-odds-provider.js.map