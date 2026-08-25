export type SearchResult = {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
};

export type SearchRequest = {
  readonly count?: number;
  readonly maxAgeDays?: number;
  readonly signal?: AbortSignal;
};

export type SearchProviderFailureClassification = "fatal" | "transient";

export type SearchProviderFailureDetails = {
  readonly provider: string;
  readonly classification: SearchProviderFailureClassification;
  readonly code: string;
  readonly attempts: number;
  readonly message: string;
  readonly cause?: unknown;
};

export class SearchProviderFailure extends Error {
  readonly provider: string;
  readonly classification: SearchProviderFailureClassification;
  readonly code: string;
  readonly attempts: number;

  constructor(details: SearchProviderFailureDetails) {
    super(details.message, { cause: details.cause });
    this.name = "SearchProviderFailure";
    this.provider = details.provider;
    this.classification = details.classification;
    this.code = details.code;
    this.attempts = details.attempts;
  }
}

export interface SearchProvider {
  readonly name: string;
  readonly search: (query: string, request?: SearchRequest) => Promise<ReadonlyArray<SearchResult>>;
}
