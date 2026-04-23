import type {Types} from 'mongoose';
import type {FetchedOdd} from '../types/odds-provider.js';
import type {MarketType} from '../types/market.js';
import type {ClosingOdds} from '../types/closing-odds.js';

interface BuildClosingOddsParams {
  fetchedOdd: FetchedOdd;
  matchId: Types.ObjectId;
  marketId: Types.ObjectId;
  marketType: MarketType;
  bookmakerId: Types.ObjectId;
  bookmakerName: string;
  capturedAt: Date;
}

export function buildClosingOdds({
  fetchedOdd,
  matchId,
  marketId,
  marketType,
  bookmakerId,
  bookmakerName,
  capturedAt,
}: BuildClosingOddsParams): ClosingOdds {
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
      sportmonks: {id: fetchedOdd.provider_odd_id},
    },
    captured_at: capturedAt,
  };
}
