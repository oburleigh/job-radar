import type { MatchingPolicy } from "@/contexts/discovery/domain/job-match";

export interface SearchProviderSettings {
  readonly label: string;
  readonly endpoint: string;
  readonly maxResults: number;
  readonly parameters: Readonly<Record<string, string>>;
  readonly apiKeyEnv: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly titleSearchMode: "title" | "anywhere" | null;
}

export interface RuntimeSettings {
  readonly network: {
    readonly timeoutMs: number;
    readonly userAgent: string;
  };
  readonly discovery: {
    readonly resultsPerQuery: number;
    readonly boardJobLimit: number;
    readonly searchFreshnessDays: number;
    readonly workYieldBatchSize: number;
    readonly runHistoryLimit: number;
    readonly titleSearchMode: "title" | "anywhere";
    readonly structuredVerificationSources: readonly string[];
    readonly closedListingMarkers: readonly string[];
  };
  readonly matching: MatchingPolicy;
  readonly ui: {
    readonly discoveryPollIntervalMs: number;
    readonly discoveryStaleAfterMs: number;
  };
  readonly searchProviders: Readonly<Record<string, SearchProviderSettings>>;
  readonly integrationPolicy: {
    readonly customPriority: number;
  };
  readonly profileDefaults: {
    readonly maximumAgeDays: number;
    readonly minimumScore: number;
    readonly salaryCurrency: string;
  };
}
