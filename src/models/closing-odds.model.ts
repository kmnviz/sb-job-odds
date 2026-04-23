import mongoose, {Model, Schema} from 'mongoose';
import type {ClosingOdds} from '../types/closing-odds.js';
import type {MarketType} from '../types/market.js';

export interface ClosingOddsDocument
  extends Omit<ClosingOdds, never>,
    Omit<mongoose.Document, 'model'> {}

const closingOddsSchema = new Schema<ClosingOddsDocument>(
  {
    match_id: {type: Schema.Types.ObjectId, required: true, index: true},
    market_id: {type: Schema.Types.ObjectId, required: true},
    market_type: {
      type: String,
      required: true,
      enum: [
        'over_under_25',
        'full_time_result',
        'both_teams_to_score',
        'asian_handicap',
      ] as MarketType[],
    },
    bookmaker_id: {type: Schema.Types.ObjectId, required: true},
    bookmaker_name: {type: String, required: true},
    outcome: {type: String, required: true},
    line: {type: String, default: null},
    team: {type: String, default: null},
    odds_decimal: {type: String, required: true},
    implied_probability: {type: String, default: null},
    captured_at: {type: Date, required: true},
    kickoff_utc: {type: Date, required: true},
    source_snapshot_id: {type: Schema.Types.ObjectId, required: true},
    providers: {
      sportmonks: {
        id: {type: String, required: true},
      },
    },
    resolved_at: {type: Date, required: true},
  },
  {
    timestamps: true,
    collection: 'closing_odds',
  }
);

closingOddsSchema.index(
  {match_id: 1, market_type: 1, bookmaker_id: 1, outcome: 1},
  {unique: true, name: 'uniq_match_market_bookmaker_outcome'}
);
closingOddsSchema.index({kickoff_utc: -1});
closingOddsSchema.index({source_snapshot_id: 1});

const ClosingOddsModel: Model<ClosingOddsDocument> =
  mongoose.models.ClosingOdds ||
  mongoose.model<ClosingOddsDocument>('ClosingOdds', closingOddsSchema);

export default ClosingOddsModel;
