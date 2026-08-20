import type { PlannedSearchQuery } from "./plan-search-queries";

export type DiscoveryRunProgress = {
  readonly hitCount: number;
  readonly jobsUpserted: number;
  readonly queryErrorCount: number;
  readonly syncErrorCount: number;
};

export type PreparedDiscoveryRun = {
  readonly id: number;
  readonly profileId: number;
  readonly providerName: string;
};

export type PersistedDiscoveryQuery = PlannedSearchQuery & {
  readonly id: number;
};

export interface DiscoveryRunJournal {
  readonly prepare: (request: {
    readonly runId?: number;
    readonly profileId: number;
    readonly providerName: string;
    readonly queryCount: number;
    readonly startedAt: Date;
  }) => PreparedDiscoveryRun;
  readonly planQueries: (
    runId: number,
    queries: readonly PlannedSearchQuery[],
  ) => readonly PersistedDiscoveryQuery[];
  readonly startQuery: (queryId: number, startedAt: Date) => void;
  readonly completeQuery: (queryId: number, hitCount: number, finishedAt: Date) => void;
  readonly failQuery: (queryId: number, message: string, finishedAt: Date) => void;
  readonly recordProgress: (
    runId: number,
    progress: DiscoveryRunProgress,
    recordedAt: Date,
  ) => void;
  readonly complete: (request: {
    readonly runId: number;
    readonly progress: DiscoveryRunProgress;
    readonly boardsDiscovered: number;
    readonly matchesFound: number;
    readonly errors: readonly string[];
    readonly allQueriesFailed: boolean;
    readonly finishedAt: Date;
  }) => void;
  readonly fail: (request: {
    readonly runId: number;
    readonly progress: DiscoveryRunProgress;
    readonly boardsDiscovered: number;
    readonly matchesFound: number;
    readonly message: string;
    readonly finishedAt: Date;
  }) => void;
}
