import mongoose, { Model } from 'mongoose';
import type { OddsSnapshot } from '../types/odds-snapshot.js';
export interface OddsSnapshotDocument extends Omit<OddsSnapshot, never>, Omit<mongoose.Document, 'model'> {
}
declare const OddsSnapshotModel: Model<OddsSnapshotDocument>;
export default OddsSnapshotModel;
//# sourceMappingURL=odds-snapshot.model.d.ts.map