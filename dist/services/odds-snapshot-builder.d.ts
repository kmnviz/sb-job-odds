import type { Types } from 'mongoose';
import type { FetchedOdd } from '../types/odds-provider.js';
import type { MarketType } from '../types/market.js';
import type { OddsSnapshot } from '../types/odds-snapshot.js';
interface BuildOddsSnapshotParams {
    fetchedOdd: FetchedOdd;
    matchId: Types.ObjectId;
    marketId: Types.ObjectId;
    marketType: MarketType;
    bookmakerId: Types.ObjectId;
    bookmakerName: string;
    capturedAt: Date;
}
export declare function buildOddsSnapshot({ fetchedOdd, matchId, marketId, marketType, bookmakerId, bookmakerName, capturedAt, }: BuildOddsSnapshotParams): OddsSnapshot;
export {};
//# sourceMappingURL=odds-snapshot-builder.d.ts.map