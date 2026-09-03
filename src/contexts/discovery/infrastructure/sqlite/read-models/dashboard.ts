import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { AnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import {
  isVerifiedJobListing,
  shouldPreferListingCandidate,
} from "@/contexts/discovery/domain/job-listing-provenance";
import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";
import type { MatchReason } from "@/contexts/discovery/domain/job-match";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  companyBoards,
  discoveryRuns,
  jobMatches,
  jobStates,
  jobs,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

import { getProfiles } from "./profiles";

type Database = BetterSQLite3Database<typeof schema>;

export interface JobFilters {
  profileId?: number;
  atsType?: AtsType;
  state?: JobListingState | "all";
  query?: string;
}

export interface DashboardJob {
  readonly id: number;
  readonly title: string;
  readonly companyName: string;
  readonly locationText: string;
  readonly atsType: AtsType;
  readonly canonicalUrl: string;
  readonly applyUrl: string;
  readonly department: string;
  readonly employmentType: string;
  readonly workplaceType: string;
  readonly publishedAt: Date | null;
  readonly firstSeenAt: Date;
  readonly salary: AnnualSalaryRange | null;
  readonly verified: boolean;
  readonly score: number;
  readonly reasons: readonly MatchReason[];
  readonly state: JobListingState;
}

export interface DashboardCounts {
  readonly matched: number;
  readonly new: number;
  readonly saved: number;
  readonly applied: number;
}

export interface DashboardScreeningSummary {
  readonly total: number;
  readonly title: number;
  readonly location: number;
  readonly stale: number;
  readonly unverified: number;
  readonly context: number;
  readonly salary: number;
}

export interface DashboardLastRun {
  readonly id: number;
  readonly provider: string;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly hitCount: number;
  readonly jobsUpserted: number;
  readonly startedAt: Date;
}

type DashboardProfiles = ReturnType<typeof getProfiles>;

export interface DashboardData {
  readonly profiles: DashboardProfiles;
  readonly profile: DashboardProfiles[number] | null;
  readonly jobs: readonly DashboardJob[];
  readonly counts: DashboardCounts;
  readonly screened: DashboardScreeningSummary;
  readonly activeSources: number;
  readonly activeBoards: number;
  readonly lastRun: DashboardLastRun | null;
}

export function getDashboardData(filters: JobFilters, database: Database): DashboardData {
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
      publishedAt: jobs.publishedAt,
      firstSeenAt: jobs.firstSeenAt,
      salaryCurrency: jobs.salaryCurrency,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      evidence: jobs.evidence,
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

  const screened = readScreeningSummary(profile.id, database);

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
    .slice(0, 250)
    .map(
      (row): DashboardJob => ({
        id: row.id,
        title: row.title,
        companyName: row.companyName,
        locationText: row.locationText,
        atsType: row.atsType,
        canonicalUrl: row.canonicalUrl,
        applyUrl: row.applyUrl,
        department: row.department,
        employmentType: row.employmentType,
        workplaceType: row.workplaceType,
        publishedAt: row.publishedAt,
        firstSeenAt: row.firstSeenAt,
        salary: row.salary,
        verified: row.verified,
        score: row.score,
        reasons: row.reasons,
        state: row.state,
      }),
    );

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

function readScreeningSummary(profileId: number, database: Database): DashboardScreeningSummary {
  return database.get<DashboardScreeningSummary>(sql`
    SELECT
      count(*) AS total,
      coalesce(sum(${jobMatches.excludedTitleReasonCount}), 0) AS title,
      coalesce(sum(${jobMatches.excludedLocationReasonCount}), 0) AS location,
      coalesce(sum(${jobMatches.staleReasonCount}), 0) AS stale,
      coalesce(sum(${jobMatches.unverifiedReasonCount}), 0) AS unverified,
      coalesce(sum(${jobMatches.contextReasonCount}), 0) AS context,
      coalesce(sum(${jobMatches.salaryReasonCount}), 0) AS salary
    FROM ${jobMatches} INDEXED BY job_matches_screening_summary_idx
    WHERE ${jobMatches.profileId} = ${profileId}
      AND ${jobMatches.status} = 'excluded'
      AND ${jobMatches.jobId} IN (
        SELECT ${jobs.id}
        FROM ${jobs} INDEXED BY jobs_active_id_idx
        WHERE ${jobs.isActive} = 1
      )
  `);
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
