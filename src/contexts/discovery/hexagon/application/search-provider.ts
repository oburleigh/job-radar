export type SearchResult = {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
};

export type SearchRequest = {
  readonly count?: number;
  readonly maxAgeDays?: number;
};

export interface SearchProvider {
  readonly name: string;
  readonly search: (query: string, request?: SearchRequest) => Promise<ReadonlyArray<SearchResult>>;
}
