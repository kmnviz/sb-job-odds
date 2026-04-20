export interface PollOddsSummary {
    matchesPolled: number;
    oddsFetched: number;
    rowsInserted: number;
    errors: number;
}
export declare function pollOdds(): Promise<PollOddsSummary>;
//# sourceMappingURL=poll-odds.service.d.ts.map