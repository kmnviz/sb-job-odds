import mongoose, { Schema } from 'mongoose';
const oddsSnapshotSchema = new Schema({
    match_id: { type: Schema.Types.ObjectId, required: true, index: true },
    market_id: { type: Schema.Types.ObjectId, required: true, index: true },
    market_type: {
        type: String,
        required: true,
        enum: [
            'over_under_25',
            'full_time_result',
            'both_teams_to_score',
            'asian_handicap',
        ],
    },
    bookmaker_id: { type: Schema.Types.ObjectId, required: true, index: true },
    bookmaker_name: { type: String, required: true },
    outcome: { type: String, required: true },
    line: { type: String, default: null },
    team: { type: String, default: null },
    odds_decimal: { type: String, required: true },
    implied_probability: { type: String, default: null },
    stopped: { type: Boolean, required: true },
    providers: {
        sportmonks: {
            id: { type: String, required: true },
        },
    },
    captured_at: { type: Date, required: true, index: true },
}, {
    timestamps: true,
    collection: 'odds_snapshots',
});
oddsSnapshotSchema.index({
    match_id: 1,
    market_id: 1,
    bookmaker_id: 1,
    captured_at: -1,
});
oddsSnapshotSchema.index({ match_id: 1, captured_at: -1 });
oddsSnapshotSchema.index({ 'providers.sportmonks.id': 1, captured_at: -1 });
oddsSnapshotSchema.index({ captured_at: -1 });
const OddsSnapshotModel = mongoose.models.OddsSnapshot ||
    mongoose.model('OddsSnapshot', oddsSnapshotSchema);
export default OddsSnapshotModel;
//# sourceMappingURL=odds-snapshot.model.js.map