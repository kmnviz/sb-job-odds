const BOOKMAKER_NAME_TO_SPORTMONKS_ID: Record<string, number> = {
  pinnacle: 20,
  bet365: 2,
};

export function getSportmonksBookmakerIdByName(
  bookmakerName: string
): number | null {
  const key = bookmakerName.trim().toLowerCase();
  return BOOKMAKER_NAME_TO_SPORTMONKS_ID[key] ?? null;
}
