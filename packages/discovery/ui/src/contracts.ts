/** Data shapes accepted by Discovery presentation components. */
export type JobListingStateView = "new" | "saved" | "applied" | "hidden";

export interface MatchingPolicyView {
  readonly exactTitleScore: number;
  readonly fullTokenScore: number;
  readonly partialTokenScore: number;
  readonly partialTokenThreshold: number;
  readonly locationScore: number;
  readonly remoteScore: number;
  readonly unknownDateScore: number;
  readonly freshnessMaxScore: number;
  readonly freshnessMinimumScore: number;
  readonly freshnessStepDays: number;
  readonly stopWords: string[];
  readonly genericTitleTerms: string[];
  readonly remoteTerms: string[];
  readonly unrestrictedRemotePhrases: string[];
}
