import type { MatchingPolicy } from "@/contexts/discovery/domain/job-match";

export type MarketVocabularyEntry = {
  readonly key: string;
  readonly label?: string | undefined;
  readonly aliases: readonly string[];
  readonly covers?: readonly string[] | undefined;
  readonly searchLanguage?: string | undefined;
};

export type MarketVocabulary = {
  readonly markets: readonly MarketVocabularyEntry[];
};

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
    readonly providerExecution: {
      readonly concurrency: number;
      readonly requestsPerInterval: number;
      readonly intervalMs: number;
      readonly maxAttempts: number;
      readonly retryMinDelayMs: number;
      readonly retryMaxDelayMs: number;
      readonly retryMaxTimeMs: number;
    };
    readonly structuredVerificationSources: readonly string[];
    readonly closedListingMarkers: readonly string[];
  };
  readonly matching: MatchingPolicy;
  readonly marketVocabulary: MarketVocabulary;
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
