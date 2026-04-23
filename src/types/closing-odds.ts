import type {Types} from 'mongoose';
import type {MarketType} from './market.js';

export interface ClosingOddsProviders {
  sportmonks: {id: string};
}

export interface ClosingOdds {
  match_id: Types.ObjectId;
  market_id: Types.ObjectId;
  market_type: MarketType;
  bookmaker_id: Types.ObjectId;
  bookmaker_name: string;
  outcome: string;
  line: string | null;
  team: string | null;
  odds_decimal: string;
  implied_probability: string | null;
  captured_at: Date;
  kickoff_utc: Date;
  source_snapshot_id: Types.ObjectId;
  providers: ClosingOddsProviders;
  resolved_at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
