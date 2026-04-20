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
export declare class SportmonksOddsClient {
    private readonly maxAttempts;
    getFixturesWithOdds(params: {
        fixtureProviderIds: string[];
        bookmakerProviderId: string;
        marketProviderId: number;
        batchSize: number;
    }): Promise<SportmonksFixtureWithOdds[]>;
    private fetchBatch;
}
export {};
//# sourceMappingURL=sportmonks-odds-client.d.ts.map