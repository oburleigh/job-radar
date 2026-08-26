import type { SearchLaneStopReason } from "@/contexts/discovery/application/discovery-runs/planning/decide-search-lane-continuation";
import type {
  SearchLaneKind,
  SearchStrategy,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";

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

export type DiscoveryRequestEvidence = {
  readonly atsType: string;
  readonly sourcePattern: string;
  readonly titleTerm: string;
  readonly text: string;
  readonly marketKey: string | null;
  readonly countryCode: string | null;
  readonly searchLanguage: string | null;
  readonly laneKind: SearchLaneKind;
  readonly strategy: SearchStrategy | null;
  readonly page: number;
};

export type PersistedDiscoveryQuery = DiscoveryRequestEvidence & {
  readonly id: number;
};

export interface DiscoveryRunJournal {
  readonly prepare: (request: {
    readonly runId?: number;
    readonly profileId: number;
    readonly providerName: string;
    readonly startedAt: Date;
  }) => PreparedDiscoveryRun;
  readonly admitRequest: (
    runId: number,
    query: DiscoveryRequestEvidence,
  ) => PersistedDiscoveryQuery;
  readonly startQuery: (queryId: number, startedAt: Date) => void;
  readonly completeQuery: (
    queryId: number,
    result: {
      readonly hitCount: number;
      readonly usefulHitCount: number;
      readonly hasMore: boolean;
      readonly stopReason: SearchLaneStopReason | null;
      readonly finishedAt: Date;
    },
  ) => void;
  readonly failQuery: (queryId: number, message: string, finishedAt: Date) => void;
  readonly cancelPendingRequests: (runId: number, message: string, finishedAt: Date) => void;
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
    readonly budgetStopReason: "max-requests-per-run" | null;
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
