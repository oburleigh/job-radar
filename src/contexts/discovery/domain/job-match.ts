/**
 * The vocabulary used to decide whether a discovered role is relevant.
 *
 * These types deliberately have no knowledge of SQLite, HTTP, or React Router so
 * the matching policy can be exercised as a deterministic domain rule.
 */
export interface MatchableJob {
  title: string;
  locationText: string;
  locations: string[];
  description: string;
  department: string;
  workplaceType: string;
  verified: boolean;
  publishedAt: Date | null;
  rawPayload?: Record<string, unknown>;
}

export interface MatchProfile {
  titleTerms: string[];
  locationTerms: string[];
  requiredJobTerms: string[];
  excludedTitleTerms: string[];
  excludedLocationTerms: string[];
  excludedDescriptionTerms: string[];
  includeRemote: boolean;
  includeUnverified: boolean;
  salaryCurrency: string;
  salaryMin: number | null;
  salaryMax: number | null;
  maxAgeDays: number;
  minScore: number;
}

export interface MatchResult {
  status: "matched" | "excluded";
  score: number;
  reasons: string[];
  exclusionReasons: string[];
}

/**
 * Product-owned matching policy. Values are supplied by the configuration
 * adapter rather than hidden inside matching rules.
 */
export interface MatchingPolicy {
  exactTitleScore: number;
  fullTokenScore: number;
  partialTokenScore: number;
  partialTokenThreshold: number;
  locationScore: number;
  remoteScore: number;
  unknownDateScore: number;
  freshnessMaxScore: number;
  freshnessMinimumScore: number;
  freshnessStepDays: number;
  stopWords: string[];
  genericTitleTerms: string[];
  remoteTerms: string[];
  unrestrictedRemotePhrases: string[];
}
