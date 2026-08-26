import type { MarketScope } from "@/contexts/discovery/domain/market";
import type { SearchResult } from "./search-provider";

export type RecordedDiscoveryHit = {
  readonly inserted: boolean;
  readonly jobsWritten: number;
  readonly syncableBoardId?: number;
};

export interface JobDiscoveryCatalog {
  readonly recordHit: (request: {
    readonly runId: number;
    readonly query: string;
    readonly rank: number;
    readonly result: SearchResult;
    readonly marketScopes: readonly MarketScope[];
    readonly recordedAt: Date;
  }) => Promise<RecordedDiscoveryHit>;
  readonly synchronizeBoard: (
    boardId: number,
    jobLimit: number,
  ) => Promise<{ readonly jobsWritten: number; readonly error: string }>;
}
