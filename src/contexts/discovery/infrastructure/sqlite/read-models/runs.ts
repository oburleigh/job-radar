import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { canonicalizeUrl, classifyUrl } from "@/contexts/discovery/infrastructure/job-sources/urls";
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

  return { run, queries, summary, funnel: readRunFunnel(database, run.id, run.profileId) };
}

function readRunFunnel(database: Database, runId: number, profileId: number) {
  const hits = database
    .select()
    .from(discoveryHits)
    .where(eq(discoveryHits.runId, runId))
    .orderBy(discoveryHits.id)
    .all();
  const classifiedHits = hits.filter((hit) => hit.atsType !== null);
  const candidateCanonicalUrls = [
    ...new Set(
      classifiedHits.flatMap((hit) => {
        const classification = classifyUrl(hit.url);
        return [classification?.canonicalUrl, hit.verificationUrl, hit.url].flatMap((url) => {
          const canonicalUrl = url ? safeCanonicalUrl(url) : null;
          return canonicalUrl ? [canonicalUrl] : [];
        });
      }),
    ),
  ];
  const storedJobs = candidateCanonicalUrls.length
    ? database.select().from(jobs).where(inArray(jobs.canonicalUrl, candidateCanonicalUrls)).all()
    : [];
  const jobsByCanonicalUrl = new Map<string, (typeof storedJobs)[number]>();
  for (const job of storedJobs) {
    const canonicalUrl = safeCanonicalUrl(job.canonicalUrl);
    if (canonicalUrl) {
      jobsByCanonicalUrl.set(canonicalUrl, job);
    }
  }
  const candidateJobs = new Map<number, (typeof storedJobs)[number]>();
  for (const hit of classifiedHits) {
    const classification = classifyUrl(hit.url);
    const canonicalUrls = [classification?.canonicalUrl, hit.verificationUrl, hit.url].flatMap(
      (url) => {
        const canonicalUrl = url ? safeCanonicalUrl(url) : null;
        return canonicalUrl ? [canonicalUrl] : [];
      },
    );
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
