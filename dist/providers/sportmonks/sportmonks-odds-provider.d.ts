import type { FetchedFixtureOdds, OddsProvider } from '../../types/odds-provider.js';
import type { MarketType } from '../../types/market.js';
import { SportmonksOddsClient } from './sportmonks-odds-client.js';
export declare class SportmonksOddsProvider implements OddsProvider {
    private readonly client;
    readonly name: "sportmonks";
    constructor(client: SportmonksOddsClient);
    fetchOddsByFixtures(params: {
        fixtureProviderIds: string[];
        marketType: MarketType;
        bookmakerProviderId: string;
        batchSize: number;
    }): Promise<FetchedFixtureOdds[]>;
}
//# sourceMappingURL=sportmonks-odds-provider.d.ts.map