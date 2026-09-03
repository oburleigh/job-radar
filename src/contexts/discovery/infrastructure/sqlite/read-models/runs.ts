import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { deriveDiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { classifyUrlWithConfig } from "@/contexts/discovery/infrastructure/job-sources/url-classification";
import { canonicalizeUrl } from "@/contexts/discovery/infrastructure/job-sources/urls";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { normalizePersistedExclusionReasons } from "@/contexts/discovery/infrastructure/sqlite/migrate-legacy-exclusion-reasons";
import {
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = typeof db;

export function countActiveDiscoveryRuns(database: Database = db): number {
  return (
    database
      .select({ value: count() })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.status, "running"))
      .get()?.value ?? 0
  );
}

export function getRunsData() {
  const { runHistoryLimit } = getJobRadarConfig().discovery;
  return db
    .select({
      id: discoveryRuns.id,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      phase: discoveryRuns.phase,
      knownBoardCount: discoveryRuns.knownBoardCount,
      knownBoardCompletedCount: discoveryRuns.knownBoardCompletedCount,
      knownBoardSuccessCount: discoveryRuns.knownBoardSuccessCount,
      activeBoardName: discoveryRuns.activeBoardName,
      webCoverageStatus: discoveryRuns.webCoverageStatus,
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
    .all()
    .map(withOutcome);
}

export function getRunDetail(runId: number) {
  return readRunDetail(db, runId);
}

export function readRunDetail(database: Database, runId: number) {
  const run = database
    .select({
      id: discoveryRuns.id,
      profileId: discoveryRuns.profileId,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      phase: discoveryRuns.phase,
      knownBoardCount: discoveryRuns.knownBoardCount,
      knownBoardCompletedCount: discoveryRuns.knownBoardCompletedCount,
      knownBoardSuccessCount: discoveryRuns.knownBoardSuccessCount,
      activeBoardName: discoveryRuns.activeBoardName,
      webCoverageStatus: discoveryRuns.webCoverageStatus,
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

  const queries = database
    .select()
    .from(discoveryQueries)
    .where(eq(discoveryQueries.runId, runId))
    .orderBy(
      asc(discoveryQueries.marketKey),
      asc(discoveryQueries.searchLanguage),
      asc(discoveryQueries.countryCode),
      asc(discoveryQueries.laneKind),
      asc(discoveryQueries.strategy),
      asc(discoveryQueries.sourcePattern),
      asc(discoveryQueries.page),
      asc(discoveryQueries.id),
    )
    .all();
  const requestSummary = Object.values(
    queries.reduce<
      Record<
        string,
        {
          market: string;
          locale: string;
          lane: string;
          strategy: string | null;
          source: string;
          atsType: (typeof queries)[number]["atsType"];
          page: number | null;
          requestCount: number;
          completedRequestCount: number;
          rawHitCount: number;
          usefulHitCount: number;
          errorCount: number;
        }
      >
    >((groups, query) => {
      const market = query.marketKey ?? "Not recorded";
      const locale = requestLocale(query.searchLanguage, query.countryCode);
      const lane = query.laneKind ?? "legacy";
      const groupKey = JSON.stringify([
        market,
        locale,
        lane,
        query.strategy,
        query.sourcePattern,
        query.atsType,
        query.page,
      ]);
      const current = groups[groupKey] ?? {
        market,
        locale,
        lane,
        strategy: query.strategy,
        source: query.sourcePattern,
        atsType: query.atsType,
        page: query.page,
        requestCount: 0,
        completedRequestCount: 0,
        rawHitCount: 0,
        usefulHitCount: 0,
        errorCount: 0,
      };
      current.requestCount += 1;
      current.completedRequestCount += Number(query.status === "completed");
      current.rawHitCount += query.hitCount;
      current.usefulHitCount += query.usefulHitCount;
      current.errorCount += Number(query.status === "failed");
      groups[groupKey] = current;
      return groups;
    }, {}),
  );

  return {
    run: withOutcome(run),
    queries,
    requestSummary,
    funnel: readRunFunnel(database, run.id, run.profileId),
  };
}

function withOutcome<
  Run extends {
    readonly status: "running" | "completed" | "failed" | "cancelled";
    readonly queryCount: number;
    readonly queryErrorCount: number;
    readonly syncErrorCount: number;
    readonly knownBoardCount: number | null;
    readonly knownBoardSuccessCount: number | null;
  },
>(run: Run): Run & { readonly outcome: ReturnType<typeof deriveDiscoveryRunOutcome> } {
  return {
    ...run,
    outcome: deriveDiscoveryRunOutcome(run),
  };
}

function requestLocale(searchLanguage: string | null, countryCode: string | null): string {
  if (searchLanguage && countryCode) {
    return `${searchLanguage}-${countryCode}`;
  }
  return searchLanguage ?? countryCode ?? "Not recorded";
}

function readRunFunnel(database: Database, runId: number, profileId: number) {
  const hits = database
    .select()
    .from(discoveryHits)
    .where(eq(discoveryHits.runId, runId))
    .orderBy(discoveryHits.id)
    .all();
  const classifiedHits = hits.filter((hit) => hit.atsType !== null);
  // `classifyUrl` reloads and revalidates the whole configuration per call, and this runs on a
  // three-second poll, so the integrations are read once and each hit is classified once.
  const integrations = getJobRadarConfig(database).ats;
  const hitCandidates = classifiedHits.map((hit) =>
    [
      classifyUrlWithConfig(hit.url, integrations)?.canonicalUrl,
      hit.verificationUrl,
      hit.url,
    ].flatMap((url) => {
      const canonicalUrl = url ? safeCanonicalUrl(url) : null;
      return canonicalUrl ? [canonicalUrl] : [];
    }),
  );
  const candidateCanonicalUrls = [...new Set(hitCandidates.flat())];
  const storedJobs = candidateCanonicalUrls.length
    ? database
        .select({ id: jobs.id, canonicalUrl: jobs.canonicalUrl, evidence: jobs.evidence })
        .from(jobs)
        .where(inArray(jobs.canonicalUrl, candidateCanonicalUrls))
        .all()
    : [];
  const jobsByCanonicalUrl = new Map<string, (typeof storedJobs)[number]>();
  for (const job of storedJobs) {
    const canonicalUrl = safeCanonicalUrl(job.canonicalUrl);
    if (canonicalUrl) {
      jobsByCanonicalUrl.set(canonicalUrl, job);
    }
  }
  const candidateJobs = new Map<number, (typeof storedJobs)[number]>();
  for (const canonicalUrls of hitCandidates) {
    const candidate = canonicalUrls
      .map((canonicalUrl) => jobsByCanonicalUrl.get(canonicalUrl))
      .find((job) => job !== undefined);
    if (candidate) {
      candidateJobs.set(candidate.id, candidate);
    }
  }
  const candidateJobIds = [...candidateJobs.keys()];
  const matches = candidateJobIds.length
    ? database
        .select()
        .from(jobMatches)
        .where(and(eq(jobMatches.profileId, profileId), inArray(jobMatches.jobId, candidateJobIds)))
        .all()
    : [];
  let verificationOnlyCandidates = 0;
  let staleOnlyCandidates = 0;
  let otherExclusions = 0;
  let finalMatches = 0;

  for (const match of matches) {
    if (match.status === "matched") {
      finalMatches += 1;
      continue;
    }
    const reasons = normalizePersistedExclusionReasons(match.exclusionReasons);
    if (hasOnlyReason(reasons, "unverified-lead")) {
      verificationOnlyCandidates += 1;
    } else if (hasOnlyReason(reasons, "stale-listing")) {
      staleOnlyCandidates += 1;
    } else {
      otherExclusions += 1;
    }
  }

  return {
    providerHits: hits.length,
    classifiedCandidates: classifiedHits.length,
    verifiedJobs: [...candidateJobs.values()].filter((job) => job.evidence === "structured").length,
    verificationOnlyCandidates,
    staleOnlyCandidates,
    otherExclusions,
    finalMatches,
  };
}

function hasOnlyReason(
  reasons: readonly ExclusionReason[],
  code: ExclusionReason["code"],
): boolean {
  return reasons.length === 1 && reasons[0]?.code === code;
}

function safeCanonicalUrl(value: string): string | null {
  try {
    return canonicalizeUrl(value);
  } catch {
    return null;
  }
}
