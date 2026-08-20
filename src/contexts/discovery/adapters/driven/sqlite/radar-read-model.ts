import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getJobRadarConfig } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import type { AtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import {
  atsIntegrations,
  companyBoards,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobStates,
  jobs,
  searchProfiles,
  sourceDomains,
} from "@/contexts/discovery/adapters/driven/sqlite/schema";
import {
  extractAnnualSalary,
  formatAnnualSalary,
} from "@/contexts/discovery/hexagon/domain/annual-salary";

export type JobState = "new" | "saved" | "applied" | "hidden";

export interface JobFilters {
  profileId?: number;
  atsType?: AtsType;
  state?: JobState | "all";
  query?: string;
}

export function getProfiles() {
  return db
    .select({
      id: searchProfiles.id,
      name: searchProfiles.name,
      enabled: searchProfiles.enabled,
      titleTerms: searchProfiles.titleTerms,
      locationTerms: searchProfiles.locationTerms,
      requiredJobTerms: searchProfiles.requiredJobTerms,
      excludedTitleTerms: searchProfiles.excludedTitleTerms,
      excludedLocationTerms: searchProfiles.excludedLocationTerms,
      excludedDescriptionTerms: searchProfiles.excludedDescriptionTerms,
      includeRemote: searchProfiles.includeRemote,
      includeUnverified: searchProfiles.includeUnverified,
      salaryCurrency: searchProfiles.salaryCurrency,
      salaryMin: searchProfiles.salaryMin,
      salaryMax: searchProfiles.salaryMax,
      maxAgeDays: searchProfiles.maxAgeDays,
      minScore: searchProfiles.minScore,
      updatedAt: searchProfiles.updatedAt,
    })
    .from(searchProfiles)
    .orderBy(searchProfiles.name)
    .all();
}

export function getDashboardData(filters: JobFilters = {}) {
  const profiles = getProfiles();
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

  const matchedRows = db
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
      verified: Object.keys(row.rawPayload).length > 0,
      salary: formatPublishedSalary(row.description, row.rawPayload),
      state: row.state ?? ("new" as const),
    }));
  const activeRows = dedupeCrossSourceMatches(matchedRows.filter((row) => row.state !== "hidden"));
  const rows =
    filters.state === "hidden"
      ? dedupeCrossSourceMatches(matchedRows.filter((row) => row.state === "hidden"))
      : activeRows;

  const excludedRows = db
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
    title: countReason(excludedReasons, "Title does not match"),
    location:
      countReason(excludedReasons, "Location does not match") +
      countReason(excludedReasons, "Excluded location term"),
    stale: countReason(excludedReasons, "Posted more than"),
    unverified: countReason(excludedReasons, "Web-search lead"),
    context: countReason(excludedReasons, "Missing a required job keyword"),
    salary: countReason(excludedReasons, "Salary "),
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

  const activeSources = db
    .select({ id: sourceDomains.id })
    .from(sourceDomains)
    .where(eq(sourceDomains.enabled, true))
    .all().length;
  const activeBoards = db
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.enabled, true))
    .all().length;
  const lastRun =
    db
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

function countReason(reasons: string[], prefix: string): number {
  return reasons.filter((reason) => reason.startsWith(prefix)).length;
}

function formatPublishedSalary(description: string, rawPayload: Record<string, unknown>): string {
  const salary = extractAnnualSalary(description, rawPayload);
  return salary ? formatAnnualSalary(salary) : "";
}

function dedupeCrossSourceMatches<
  T extends {
    title: string;
    companyName: string;
    atsType: AtsType;
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
    if (existing && existing.atsType === "linkedin" && row.atsType !== "linkedin") {
      result[position] = row;
    }
  }

  return result;
}

function normalizeDedupeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSourcesData() {
  return {
    sources: db.select().from(sourceDomains).orderBy(sourceDomains.priority).all(),
    boards: db
      .select({
        id: companyBoards.id,
        atsType: companyBoards.atsType,
        companyName: companyBoards.companyName,
        slug: companyBoards.slug,
        baseUrl: companyBoards.baseUrl,
        enabled: companyBoards.enabled,
        lastSyncedAt: companyBoards.lastSyncedAt,
        lastError: companyBoards.lastError,
      })
      .from(companyBoards)
      .orderBy(companyBoards.atsType, companyBoards.companyName)
      .all(),
  };
}

export function getRunsData() {
  const { runHistoryLimit } = getJobRadarConfig().discovery;
  return db
    .select({
      id: discoveryRuns.id,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      queryCount: discoveryRuns.queryCount,
      hitCount: discoveryRuns.hitCount,
      boardsDiscovered: discoveryRuns.boardsDiscovered,
      jobsUpserted: discoveryRuns.jobsUpserted,
      matchesFound: discoveryRuns.matchesFound,
      queryErrorCount: discoveryRuns.queryErrorCount,
      syncErrorCount: discoveryRuns.syncErrorCount,
      error: discoveryRuns.error,
      startedAt: discoveryRuns.startedAt,
      finishedAt: discoveryRuns.finishedAt,
    })
    .from(discoveryRuns)
    .innerJoin(searchProfiles, eq(searchProfiles.id, discoveryRuns.profileId))
    .orderBy(desc(discoveryRuns.startedAt))
    .limit(runHistoryLimit)
    .all();
}

export function getRunDetail(runId: number) {
  const run = db
    .select({
      id: discoveryRuns.id,
      profileId: discoveryRuns.profileId,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      queryCount: discoveryRuns.queryCount,
      hitCount: discoveryRuns.hitCount,
      boardsDiscovered: discoveryRuns.boardsDiscovered,
      jobsUpserted: discoveryRuns.jobsUpserted,
      matchesFound: discoveryRuns.matchesFound,
      queryErrorCount: discoveryRuns.queryErrorCount,
      syncErrorCount: discoveryRuns.syncErrorCount,
      error: discoveryRuns.error,
      startedAt: discoveryRuns.startedAt,
      finishedAt: discoveryRuns.finishedAt,
    })
    .from(discoveryRuns)
    .innerJoin(searchProfiles, eq(searchProfiles.id, discoveryRuns.profileId))
    .where(eq(discoveryRuns.id, runId))
    .get();
  if (!run) {
    return null;
  }

  const queries = db
    .select()
    .from(discoveryQueries)
    .where(eq(discoveryQueries.runId, runId))
    .orderBy(
      asc(discoveryQueries.atsType),
      asc(discoveryQueries.titleTerm),
      asc(discoveryQueries.sourcePattern),
    )
    .all();
  const summary = Object.values(
    queries.reduce<
      Record<
        string,
        {
          atsType: AtsType;
          queryCount: number;
          completedCount: number;
          hitCount: number;
          errorCount: number;
        }
      >
    >((groups, query) => {
      const current = groups[query.atsType] ?? {
        atsType: query.atsType,
        queryCount: 0,
        completedCount: 0,
        hitCount: 0,
        errorCount: 0,
      };
      current.queryCount += 1;
      current.completedCount += Number(query.status === "completed");
      current.hitCount += query.hitCount;
      current.errorCount += Number(query.status === "failed");
      groups[query.atsType] = current;
      return groups;
    }, {}),
  ).sort((left, right) => left.atsType.localeCompare(right.atsType));

  return { run, queries, summary };
}

export function getSettingsData() {
  const config = getJobRadarConfig();
  const sources = db.select().from(sourceDomains).orderBy(sourceDomains.priority).all();
  const integrations = db
    .select()
    .from(atsIntegrations)
    .orderBy(atsIntegrations.priority)
    .all()
    .map((integration) => ({
      ...integration,
      searchPatterns: sources
        .filter((source) => source.atsType === integration.atsType)
        .map((source) => source.pattern),
    }));

  return {
    network: config.network,
    discovery: config.discovery,
    ui: config.ui,
    matching: config.matching,
    searchProviders: config.searchProviders,
    integrationPolicy: config.integrationPolicy,
    integrations,
  };
}
