import type {
  QuerySource,
  SearchStrategy,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type { ResolvedMarket } from "@/contexts/discovery/domain/market";

export type DiscoveryCriteria = {
  readonly id: number;
  readonly titleTerms: readonly string[];
  readonly markets: readonly ResolvedMarket[];
  readonly excludedMarkets: readonly ResolvedMarket[];
  readonly includeRemote: boolean;
  readonly maxAgeDays: number;
};

export type DiscoverySource = QuerySource & {
  readonly supportsBoardSync: boolean;
};

export type DiscoveryPolicy = {
  readonly resultsPerQuery: number;
  readonly boardJobLimit: number;
  readonly searchFreshnessDays: number;
  readonly workYieldBatchSize: number;
  readonly strategies: readonly SearchStrategy[];
  readonly minimumUsefulHitsPerPage: number;
  readonly maxPagesPerLane: number;
  readonly maxRequestsPerRun: number;
  readonly worldwideRemoteTerms: readonly string[];
};

export type DiscoverySetup = {
  readonly profile: DiscoveryCriteria;
  readonly sources: readonly DiscoverySource[];
  readonly policy: DiscoveryPolicy;
};

export interface DiscoverySetupReader {
  readonly load: (request: {
    readonly profileId: number;
    readonly providerName: string | null;
    readonly source?: string;
  }) => DiscoverySetup;
}
