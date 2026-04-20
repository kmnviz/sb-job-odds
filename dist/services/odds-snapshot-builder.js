export function buildOddsSnapshot({ fetchedOdd, matchId, marketId, marketType, bookmakerId, bookmakerName, capturedAt, }) {
    return {
        match_id: matchId,
        market_id: marketId,
        market_type: marketType,
        bookmaker_id: bookmakerId,
        bookmaker_name: bookmakerName,
        outcome: fetchedOdd.outcome,
        line: fetchedOdd.line,
        team: fetchedOdd.team,
        odds_decimal: fetchedOdd.odds_decimal,
        implied_probability: fetchedOdd.implied_probability,
        stopped: fetchedOdd.stopped,
        providers: {
            sportmonks: {
                id: fetchedOdd.provider_odd_id,
            },
        },
        captured_at: capturedAt,
    };
}
//# sourceMappingURL=odds-snapshot-builder.js.map