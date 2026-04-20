export function mapAsianHandicapLabelToOutcome(label: string): 'home' | 'away' {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'home') return 'home';
  if (normalized === 'away') return 'away';
  throw new Error(`Unsupported Asian Handicap label: ${label}`);
}
