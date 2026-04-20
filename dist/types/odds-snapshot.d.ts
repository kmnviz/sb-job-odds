import type { Types } from 'mongoose';
import type { MarketType } from './market.js';
export interface OddsSnapshotProviders {
    sportmonks: {
        id: string;
    };
}
export interface OddsSnapshot {
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
    stopped: boolean;
    providers: OddsSnapshotProviders;
    captured_at: Date;
    createdAt?: Date;
    updatedAt?: Date;
}
//# sourceMappingURL=odds-snapshot.d.ts.map