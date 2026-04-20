const MARKET_TYPE_TO_SPORTMONKS = {
    full_time_result: 1,
    both_teams_to_score: 14,
    over_under_25: 80,
    asian_handicap: 6,
};
export function getSportmonksMarketId(marketType) {
    const id = MARKET_TYPE_TO_SPORTMONKS[marketType];
    if (id == null) {
        throw new Error(`No Sportmonks market ID for market type: ${marketType}`);
    }
    return id;
}
//# sourceMappingURL=sportmonks-market.mapping.js.map