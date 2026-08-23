import { and, desc, eq } from "drizzle-orm";
import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import {
  isVerifiedJobListing,
  shouldPreferListingCandidate,
} from "@/contexts/discovery/domain/job-listing-provenance";
import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  companyBoards,
  discoveryRuns,
  jobMatches,
  jobStates,
  jobs,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

import { getProfiles } from "./profiles";

type Database = typeof db;

export interface JobFilters {
  profileId?: number;
  atsType?: AtsType;
  state?: JobListingState | "all";
  query?: string;
}

export function getDashboardData(filters: JobFilters = {}, database: Database = db) {
  const profiles = getProfiles(database);
  const profile =
    profiles.find((item) => item.id === filters.profileId) ??
    profiles.find((item) => item.enabled) ??
    profiles[0] ??
    null;

  if (!profile) {
    return {
      profiles,
      profile: null,
      jobs: [],
      counts: { matched: 0, new: 0, saved: 0, applied: 0 },
      screened: {
        total: 0,
        title: 0,
        location: 0,
        stale: 0,
        unverified: 0,
        context: 0,
        salary: 0,
      },
      activeSources: 0,
      activeBoards: 0,
      lastRun: null,
    };
  }

  const matchedRows = database
    .select({
      id: jobs.id,
      title: jobs.title,
      companyName: jobs.companyName,
      locationText: jobs.locationText,
      atsType: jobs.atsType,
      canonicalUrl: jobs.canonicalUrl,
      applyUrl: jobs.applyUrl,
      department: jobs.department,
      employmentType: jobs.employmentType,
      workplaceType: jobs.workplaceType,
      description: jobs.description,
      publishedAt: jobs.publishedAt,
      firstSeenAt: jobs.firstSeenAt,
      salaryCurrency: jobs.salaryCurrency,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      evidence: jobs.evidence,
      rawPayload: jobs.rawPayload,
      score: jobMatches.score,
      reasons: jobMatches.reasons,
      state: jobStates.status,
      notes: jobStates.notes,
    })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .leftJoin(jobStates, and(eq(jobStates.jobId, jobs.id), eq(jobStates.profileId, profile.id)))
    .where(
      and(
        eq(jobMatches.profileId, profile.id),
        eq(jobMatches.status, "matched"),
        eq(jobs.isActive, true),
      ),
    )
    .orderBy(desc(jobMatches.score), desc(jobs.publishedAt))
    .all()
    .map((row) => ({
      ...row,
      verified: isVerifiedJobListing(row.evidence),
      salary: createAnnualSalaryRange(row.salaryCurrency, row.salaryMin, row.salaryMax),
      state: row.state ?? ("new" as const),
    }));
  const activeRows = dedupeCrossSourceMatches(matchedRows.filter((row) => row.state !== "hidden"));
  const rows =
    filters.state === "hidden"
      ? dedupeCrossSourceMatches(matchedRows.filter((row) => row.state === "hidden"))
      : activeRows;

  const excludedRows = database
    .select({ reasons: jobMatches.exclusionReasons })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .where(
      and(
        eq(jobMatches.profileId, profile.id),
        eq(jobMatches.status, "excluded"),
        eq(jobs.isActive, true),
      ),
    )
    .all();
  const excludedReasons = excludedRows.flatMap((row) => row.reasons);
  const screened = {
    total: excludedRows.length,
    title: countReasons(excludedReasons, ["title-mismatch", "excluded-title"]),
    location: countReasons(excludedReasons, ["location-mismatch", "excluded-location"]),
    stale: countReasons(excludedReasons, ["stale-listing"]),
    unverified: countReasons(excludedReasons, ["unverified-lead"]),
    context: countReasons(excludedReasons, ["missing-required-job-term"]),
    salary: countReasons(excludedReasons, ["salary-above", "salary-below"]),
  };

  const counts = {
    matched: activeRows.length,
    new: activeRows.filter((row) => row.state === "new").length,
    saved: activeRows.filter((row) => row.state === "saved").length,
    applied: activeRows.filter((row) => row.state === "applied").length,
  };

  const query = filters.query?.trim().toLowerCase() ?? "";
  const filteredJobs = rows
    .filter((row) => !filters.atsType || row.atsType === filters.atsType)
    .filter((row) => !filters.state || filters.state === "all" || row.state === filters.state)
    .filter(
      (row) =>
        !query ||
        `${row.title} ${row.companyName} ${row.locationText}`.toLowerCase().includes(query),
    )
    .slice(0, 250);

  const activeSources = database
    .select({ id: sourceDomains.id })
    .from(sourceDomains)
    .where(eq(sourceDomains.enabled, true))
    .all().length;
  const activeBoards = database
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.enabled, true))
    .all().length;
  const lastRun =
    database
      .select({
        id: discoveryRuns.id,
        provider: discoveryRuns.provider,
        status: discoveryRuns.status,
        hitCount: discoveryRuns.hitCount,
        jobsUpserted: discoveryRuns.jobsUpserted,
        startedAt: discoveryRuns.startedAt,
      })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.profileId, profile.id))
      .orderBy(desc(discoveryRuns.startedAt))
      .limit(1)
      .get() ?? null;

  return {
    profiles,
    profile,
    jobs: filteredJobs,
    counts,
    screened,
    activeSources,
    activeBoards,
    lastRun,
  };
}

function countReasons(
  reasons: readonly ExclusionReason[],
  codes: ReadonlyArray<ExclusionReason["code"]>,
): number {
  return reasons.filter((reason) => codes.includes(reason.code)).length;
}

function dedupeCrossSourceMatches<
  T extends {
    title: string;
    companyName: string;
    atsType: AtsType;
    evidence: "search-lead" | "structured";
  },
>(rows: T[]): T[] {
  const result: T[] = [];
  const positions = new Map<string, number>();

  for (const row of rows) {
    const key = `${normalizeDedupeText(row.companyName)}|${normalizeDedupeText(row.title)}`;
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, result.length);
      result.push(row);
      continue;
    }

    const existing = result[position];
    if (
      existing &&
      shouldPreferListingCandidate(
        { evidence: existing.evidence, authority: authorityFor(existing.atsType) },
        { evidence: row.evidence, authority: authorityFor(row.atsType) },
      )
    ) {
      result[position] = row;
    }
  }

  return result;
}

function authorityFor(atsType: AtsType): "primary" | "secondary" {
  return atsType === "linkedin" ? "secondary" : "primary";
}

function normalizeDedupeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
