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
    readonly locationTerms: readonly string[];
    readonly recordedAt: Date;
  }) => Promise<RecordedDiscoveryHit>;
  readonly synchronizeBoard: (
    boardId: number,
    jobLimit: number,
  ) => Promise<{ readonly jobsWritten: number; readonly error: string }>;
}
