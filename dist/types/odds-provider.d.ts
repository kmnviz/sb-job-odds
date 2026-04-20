import type { MarketType } from './market.js';
export interface FetchedOdd {
    outcome: string;
    line: string | null;
    team: string | null;
    odds_decimal: string;
    implied_probability: string | null;
    stopped: boolean;
    provider_odd_id: string;
}
export interface FetchedFixtureOdds {
    fixtureProviderId: string;
    odds: FetchedOdd[];
}
export interface OddsProvider {
    readonly name: 'sportmonks';
    fetchOddsByFixtures(params: {
        fixtureProviderIds: string[];
        marketType: MarketType;
        bookmakerProviderId: string;
        batchSize: number;
    }): Promise<FetchedFixtureOdds[]>;
}
//# sourceMappingURL=odds-provider.d.ts.map