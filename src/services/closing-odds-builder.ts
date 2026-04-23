import type {Types} from 'mongoose';
import type {OddsSnapshotDocument} from '../models/odds-snapshot.model.js';
import type {ClosingOdds} from '../types/closing-odds.js';

interface BuildClosingOddsParams {
  sourceSnapshot: OddsSnapshotDocument;
  kickoffUtc: Date;
  resolvedAt: Date;
}

export function buildClosingOdds({
  sourceSnapshot,
  kickoffUtc,
  resolvedAt,
}: BuildClosingOddsParams): ClosingOdds {
  return {
    match_id: sourceSnapshot.match_id,
    market_id: sourceSnapshot.market_id,
    market_type: sourceSnapshot.market_type,
    bookmaker_id: sourceSnapshot.bookmaker_id,
    bookmaker_name: sourceSnapshot.bookmaker_name,
    outcome: sourceSnapshot.outcome,
    line: sourceSnapshot.line,
    team: sourceSnapshot.team,
    odds_decimal: sourceSnapshot.odds_decimal,
    implied_probability: sourceSnapshot.implied_probability,
    captured_at: sourceSnapshot.captured_at,
    kickoff_utc: kickoffUtc,
    source_snapshot_id: sourceSnapshot._id as Types.ObjectId,
    providers: {
      sportmonks: {
        id: sourceSnapshot.providers.sportmonks.id,
      },
    },
    resolved_at: resolvedAt,
  };
}
