import { and, eq } from "drizzle-orm";
import type { SearchStrategy } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type { MatchingPolicy } from "@/contexts/discovery/domain/job-match";
import { supportsAtsPostingLookup } from "@/contexts/discovery/infrastructure/job-sources/connectors";
import { canonicalizeUrl, classifyUrl } from "@/contexts/discovery/infrastructure/job-sources/urls";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { getDashboardData } from "./dashboard";

type Database = typeof db;

export interface DiscoveryBenchmarkPolicySnapshot {
  readonly resultsPerQuery: number;
  readonly boardJobLimit: number;
  readonly searchFreshnessDays: number;
  readonly strategies: readonly SearchStrategy[];
  readonly matching: MatchingPolicy;
}

interface DiscoveryBenchmarkRequest {
  readonly runId: number;
  readonly profileId: number;
  readonly knownRoleUrl: string;
  readonly benchmarkedAt: Date;
  readonly policy: DiscoveryBenchmarkPolicySnapshot;
}

export function readDiscoveryBenchmark(database: Database, request: DiscoveryBenchmarkRequest) {
  const run = database
    .select()
    .from(discoveryRuns)
    .where(and(eq(discoveryRuns.id, request.runId), eq(discoveryRuns.profileId, request.profileId)))
    .get();
  if (!run) {
    throw new Error(
      `Discovery run ${request.runId} was not found for profile ${request.profileId}`,
    );
  }
  const profile = database
    .select()
    .from(searchProfiles)
    .where(eq(searchProfiles.id, request.profileId))
    .get();
  if (!profile) {
    throw new Error(`Search profile ${request.profileId} was not found`);
  }

  const queries = database
    .select()
    .from(discoveryQueries)
    .where(eq(discoveryQueries.runId, run.id))
    .orderBy(discoveryQueries.id)
    .all();
  const hits = database
    .select()
    .from(discoveryHits)
    .where(eq(discoveryHits.runId, run.id))
    .orderBy(discoveryHits.id)
    .all();
  const canonicalKnownRoleUrl = canonicalizeUrl(request.knownRoleUrl);
  const knownHit = hits.find((hit) => safeCanonicalUrl(hit.url) === canonicalKnownRoleUrl);
  const knownJob = database
    .select()
    .from(jobs)
    .all()
    .find((job) => safeCanonicalUrl(job.canonicalUrl) === canonicalKnownRoleUrl);
  const knownMatch = knownJob
    ? database
        .select()
        .from(jobMatches)
        .where(and(eq(jobMatches.profileId, request.profileId), eq(jobMatches.jobId, knownJob.id)))
        .get()
    : undefined;
  const visibleJob = getDashboardData({ profileId: request.profileId }, database).jobs.find(
    (job) => safeCanonicalUrl(job.canonicalUrl) === canonicalKnownRoleUrl,
  );
  const boardTrigger =
    !knownHit && knownJob?.boardId
      ? hits.find((hit) => hit.boardId === knownJob.boardId)
      : undefined;
  const querySources = [...new Set(queries.map((query) => query.atsType))];
  const supportedAtsHits = hits.filter((hit) => {
    const classification = classifyUrl(hit.url);
    return Boolean(classification?.externalId && supportsAtsPostingLookup(classification.atsType));
  });
  const exactOutcomes = supportedAtsHits.filter((hit) => hit.verificationStatus !== null);
  const entry = knownHit
    ? ("direct-search-hit" as const)
    : knownJob?.boardId && hits.some((hit) => hit.boardId === knownJob.boardId)
      ? ("board-sync" as const)
      : knownJob
        ? ("preexisting" as const)
        : ("absent" as const);

  return {
    benchmarkedAt: request.benchmarkedAt.toISOString(),
    run: {
      id: run.id,
      provider: run.provider,
      source: querySources.length === 1 ? (querySources[0] ?? "all") : "all",
      status: run.status,
      counts: {
        plannedQueries: queries.length,
        successfulQueries: queries.filter((query) => query.status === "completed").length,
        failedQueries: queries.filter((query) => query.status === "failed").length,
        providerResults: queries.reduce((count, query) => count + query.hitCount, 0),
        uniqueHits: hits.length,
        classifiedHits: hits.filter((hit) => hit.atsType !== null).length,
        unclassifiedHits: hits.filter((hit) => hit.atsType === null).length,
        boardsDiscovered: run.boardsDiscovered,
        jobsWritten: run.jobsUpserted,
        matches: run.matchesFound,
        syncErrors: run.syncErrorCount,
      },
      exactVerification: {
        supportedHits: supportedAtsHits.length,
        outcomesAssigned: exactOutcomes.length,
        outcomeRate:
          supportedAtsHits.length === 0 ? null : exactOutcomes.length / supportedAtsHits.length,
        byStatus: {
          verified: exactOutcomes.filter((hit) => hit.verificationStatus === "verified").length,
          closed: exactOutcomes.filter((hit) => hit.verificationStatus === "closed").length,
          notFound: exactOutcomes.filter((hit) => hit.verificationStatus === "not_found").length,
          protected: exactOutcomes.filter((hit) => hit.verificationStatus === "protected").length,
          transientFailure: exactOutcomes.filter(
            (hit) => hit.verificationStatus === "transient_failure",
          ).length,
        },
      },
    },
    inputs: {
      profile: {
        id: profile.id,
        name: profile.name,
        titleTerms: profile.titleTerms,
        locationTerms: profile.locationTerms,
        requiredJobTerms: profile.requiredJobTerms,
        excludedTitleTerms: profile.excludedTitleTerms,
        excludedLocationTerms: profile.excludedLocationTerms,
        excludedDescriptionTerms: profile.excludedDescriptionTerms,
        includeRemote: profile.includeRemote,
        includeUnverified: profile.includeUnverified,
        salaryCurrency: profile.salaryCurrency,
        salaryMin: profile.salaryMin,
        salaryMax: profile.salaryMax,
        maxAgeDays: profile.maxAgeDays,
        minScore: profile.minScore,
      },
      policy: request.policy,
    },
    plannedQueries: queries.map((query) => ({
      sourcePattern: query.sourcePattern,
      titleTerm: query.titleTerm,
      queryText: query.queryText,
      status: query.status,
      providerResults: query.hitCount,
      error: query.error,
    })),
    knownRole: {
      requestedUrl: request.knownRoleUrl,
      canonicalUrl: canonicalKnownRoleUrl,
      providerResponse: {
        returned: knownHit !== undefined,
        rank: knownHit?.rank ?? null,
        query: knownHit?.query ?? null,
      },
      classification: knownHit
        ? {
            status: knownHit.atsType ? ("classified" as const) : ("unclassified" as const),
            atsType: knownHit.atsType,
            boardId: knownHit.boardId,
          }
        : { status: "not-returned" as const, atsType: null, boardId: null },
      verification: {
        status: knownJob
          ? !knownJob.isActive
            ? ("inactive" as const)
            : knownJob.evidence === "structured"
              ? ("verified" as const)
              : ("unverified" as const)
          : ("not-observed" as const),
        entry,
        active: knownJob?.isActive ?? null,
        evidence: knownJob?.evidence ?? null,
        externalId: knownJob?.externalId ?? "",
        boardTrigger: boardTrigger
          ? { url: boardTrigger.url, rank: boardTrigger.rank, query: boardTrigger.query }
          : null,
      },
      match: knownMatch
        ? {
            status: knownMatch.status,
            score: knownMatch.score,
            reasons: knownMatch.reasons,
            exclusionReasons: knownMatch.exclusionReasons,
          }
        : {
            status: "not-evaluated" as const,
            score: null,
            reasons: [],
            exclusionReasons: [],
          },
      visibleCard: {
        visible: visibleJob !== undefined,
        state: visibleJob?.state ?? null,
      },
    },
  };
}

function safeCanonicalUrl(value: string): string | null {
  try {
    return canonicalizeUrl(value);
  } catch {
    return null;
  }
}
