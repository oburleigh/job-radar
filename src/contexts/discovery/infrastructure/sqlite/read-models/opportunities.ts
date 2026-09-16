import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { isVerifiedJobListing } from "@/contexts/discovery/domain/job-listing-provenance";
import type { MatchReason } from "@/contexts/discovery/domain/job-match";
import type * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  jobMatches,
  jobStates,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = BetterSQLite3Database<typeof schema>;

export interface OpportunityReference {
  readonly searchProfileId: number;
  readonly jobListingId: number;
}

export interface OpportunitySnapshot extends OpportunityReference {
  readonly description: string;
  readonly searchCriteria: {
    readonly titleTerms: readonly string[];
    readonly locationTerms: readonly string[];
    readonly requiredJobTerms: readonly string[];
    readonly excludedTitleTerms: readonly string[];
    readonly excludedLocationTerms: readonly string[];
    readonly excludedDescriptionTerms: readonly string[];
    readonly includeRemote: boolean;
    readonly salaryCurrency: string;
    readonly salaryMin: number | null;
    readonly salaryMax: number | null;
  };
  readonly title: string;
  readonly companyName: string;
  readonly locationText: string;
  readonly canonicalUrl: string;
  readonly applyUrl: string;
  readonly listingIsActive: boolean;
  readonly lastSeenAt: Date;
  readonly matchScore: number;
  readonly matchReasons: readonly MatchReason[];
  readonly verified: boolean;
}

export function listRankedOpportunities(database: Database): OpportunitySnapshot[] {
  return opportunitySelection(database)
    .where(
      and(
        eq(jobMatches.status, "matched"),
        eq(jobs.isActive, true),
        or(isNull(jobStates.status), ne(jobStates.status, "hidden")),
      ),
    )
    .orderBy(
      desc(jobMatches.score),
      desc(jobs.publishedAt),
      asc(jobMatches.profileId),
      asc(jobs.id),
    )
    .all()
    .map(toSnapshot);
}

export function findRankedOpportunity(
  database: Database,
  reference: OpportunityReference,
): OpportunitySnapshot | null {
  const row = opportunitySelection(database)
    .where(
      and(
        eq(jobMatches.profileId, reference.searchProfileId),
        eq(jobMatches.jobId, reference.jobListingId),
        eq(jobMatches.status, "matched"),
        eq(jobs.isActive, true),
        or(isNull(jobStates.status), ne(jobStates.status, "hidden")),
      ),
    )
    .get();
  return row ? toSnapshot(row) : null;
}

export function getOpportunitySnapshot(
  database: Database,
  reference: OpportunityReference,
): OpportunitySnapshot | null {
  const row = opportunitySelection(database)
    .where(
      and(
        eq(jobMatches.profileId, reference.searchProfileId),
        eq(jobMatches.jobId, reference.jobListingId),
      ),
    )
    .get();
  return row ? toSnapshot(row) : null;
}

function opportunitySelection(database: Database) {
  return database
    .select({
      searchProfileId: jobMatches.profileId,
      jobListingId: jobs.id,
      description: jobs.description,
      searchCriteria: {
        titleTerms: searchProfiles.titleTerms,
        locationTerms: searchProfiles.locationTerms,
        requiredJobTerms: searchProfiles.requiredJobTerms,
        excludedTitleTerms: searchProfiles.excludedTitleTerms,
        excludedLocationTerms: searchProfiles.excludedLocationTerms,
        excludedDescriptionTerms: searchProfiles.excludedDescriptionTerms,
        includeRemote: searchProfiles.includeRemote,
        salaryCurrency: searchProfiles.salaryCurrency,
        salaryMin: searchProfiles.salaryMin,
        salaryMax: searchProfiles.salaryMax,
      },
      title: jobs.title,
      companyName: jobs.companyName,
      locationText: jobs.locationText,
      canonicalUrl: jobs.canonicalUrl,
      applyUrl: jobs.applyUrl,
      listingIsActive: jobs.isActive,
      lastSeenAt: jobs.lastSeenAt,
      matchScore: jobMatches.score,
      matchReasons: jobMatches.reasons,
      evidence: jobs.evidence,
    })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .innerJoin(searchProfiles, eq(searchProfiles.id, jobMatches.profileId))
    .leftJoin(
      jobStates,
      and(eq(jobStates.profileId, jobMatches.profileId), eq(jobStates.jobId, jobMatches.jobId)),
    )
    .$dynamic();
}

function toSnapshot(row: {
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly description: string;
  readonly searchCriteria: {
    readonly titleTerms: readonly string[];
    readonly locationTerms: readonly string[];
    readonly requiredJobTerms: readonly string[];
    readonly excludedTitleTerms: readonly string[];
    readonly excludedLocationTerms: readonly string[];
    readonly excludedDescriptionTerms: readonly string[];
    readonly includeRemote: boolean;
    readonly salaryCurrency: string;
    readonly salaryMin: number | null;
    readonly salaryMax: number | null;
  };
  readonly title: string;
  readonly companyName: string;
  readonly locationText: string;
  readonly canonicalUrl: string;
  readonly applyUrl: string;
  readonly listingIsActive: boolean;
  readonly lastSeenAt: Date;
  readonly matchScore: number;
  readonly matchReasons: readonly MatchReason[];
  readonly evidence: "search-lead" | "structured";
}): OpportunitySnapshot {
  const { evidence, ...snapshot } = row;
  return { ...snapshot, verified: isVerifiedJobListing(evidence) };
}
