const BOOKMAKER_NAME_TO_SPORTMONKS_ID = {
    pinnacle: 20,
    bet365: 2,
};
export function getSportmonksBookmakerIdByName(bookmakerName) {
    const key = bookmakerName.trim().toLowerCase();
    return BOOKMAKER_NAME_TO_SPORTMONKS_ID[key] ?? null;
}
//# sourceMappingURL=sportmonks-bookmaker.mapping.js.map