import type {MarketType} from '../../types/market.js';

export function mapAsianHandicapLabelToOutcome(label: string): 'home' | 'away' {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'home') return 'home';
  if (normalized === 'away') return 'away';
  throw new Error(`Unsupported Asian Handicap label: ${label}`);
}

export function mapFullTimeResultLabelToOutcome(
  label: string
): 'home' | 'draw' | 'away' {
  const normalized = label.trim().toLowerCase();
  if (normalized === '1' || normalized === 'home') return 'home';
  if (normalized === 'x' || normalized === 'draw') return 'draw';
  if (normalized === '2' || normalized === 'away') return 'away';
  throw new Error(`Unsupported Full Time Result label: ${label}`);
}

export function mapOverUnder25LabelToOutcome(
  label: string
): 'over' | 'under' {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'over') return 'over';
  if (normalized === 'under') return 'under';
  throw new Error(`Unsupported Over/Under 2.5 label: ${label}`);
}

export function mapBothTeamsToScoreLabelToOutcome(
  label: string
): 'yes' | 'no' {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'yes') return 'yes';
  if (normalized === 'no') return 'no';
  throw new Error(`Unsupported Both Teams To Score label: ${label}`);
}

export function mapSportmonksLabelToOutcome(
  marketType: MarketType,
  label: string
): string {
  switch (marketType) {
    case 'asian_handicap':
      return mapAsianHandicapLabelToOutcome(label);
    case 'full_time_result':
      return mapFullTimeResultLabelToOutcome(label);
    case 'over_under_25':
      return mapOverUnder25LabelToOutcome(label);
    case 'both_teams_to_score':
      return mapBothTeamsToScoreLabelToOutcome(label);
    default: {
      const exhaustive: never = marketType;
      throw new Error(`Unsupported market type: ${exhaustive as string}`);
    }
  }
}
