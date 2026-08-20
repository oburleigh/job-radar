import type {
  QuerySource,
  SearchQueryCriteria,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-queries";

export type DiscoveryCriteria = SearchQueryCriteria & {
  readonly id: number;
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
  readonly titleSearchMode: "title" | "anywhere";
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
    readonly providerName: string;
    readonly source?: string;
  }) => DiscoverySetup;
}
