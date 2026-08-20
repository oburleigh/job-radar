import type { AnnualSalaryRange } from "./annual-salary";
import type { Currency } from "./currency";

/**
 * The vocabulary used to decide whether a discovered role is relevant.
 *
 * These types deliberately have no knowledge of SQLite, HTTP, or React Router so
 * the matching policy can be exercised as a deterministic domain rule.
 */
export interface MatchableJob {
  readonly title: string;
  readonly locationText: string;
  readonly locations: readonly string[];
  readonly description: string;
  readonly department: string;
  readonly workplaceType: string;
  readonly verified: boolean;
  readonly publishedAt: Date | null;
  readonly publishedSalary: AnnualSalaryRange | null;
}

export interface JobMatchingCriteria {
  readonly titleTerms: readonly string[];
  readonly locationTerms: readonly string[];
  readonly requiredJobTerms: readonly string[];
  readonly excludedTitleTerms: readonly string[];
  readonly excludedLocationTerms: readonly string[];
  readonly excludedDescriptionTerms: readonly string[];
  readonly includeRemote: boolean;
  readonly includeUnverified: boolean;
  readonly salaryCurrency: Currency | null;
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  readonly maxAgeDays: number;
  readonly minScore: number;
}

export interface MatchResult {
  readonly status: "matched" | "excluded";
  readonly score: number;
  readonly reasons: readonly MatchReason[];
  readonly exclusionReasons: readonly ExclusionReason[];
}

export type MatchReason =
  | { readonly code: "title-match"; readonly term: string }
  | { readonly code: "job-context-match"; readonly term: string }
  | { readonly code: "salary-overlap"; readonly salary: AnnualSalaryRange }
  | { readonly code: "location-match"; readonly term: string }
  | { readonly code: "remote-allowed" }
  | { readonly code: "posted-age"; readonly days: number }
  | { readonly code: "posting-date-unknown" };

export type ExclusionReason =
  | { readonly code: "unverified-lead" }
  | { readonly code: "excluded-title"; readonly term: string }
  | { readonly code: "excluded-description"; readonly term: string }
  | { readonly code: "missing-required-job-term" }
  | { readonly code: "title-mismatch" }
  | { readonly code: "excluded-location"; readonly term: string }
  | { readonly code: "location-mismatch" }
  | { readonly code: "stale-listing"; readonly maximumAgeDays: number }
  | { readonly code: "salary-below"; readonly salary: AnnualSalaryRange }
  | { readonly code: "salary-above"; readonly salary: AnnualSalaryRange }
  | { readonly code: "score-below"; readonly minimumScore: number };

/**
 * Product-owned matching policy. Values are supplied by the configuration
 * adapter rather than hidden inside matching rules.
 */
export interface MatchingPolicy {
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
  readonly stopWords: readonly string[];
  readonly genericTitleTerms: readonly string[];
  readonly remoteTerms: readonly string[];
  readonly unrestrictedRemotePhrases: readonly string[];
}
