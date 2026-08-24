import { and, eq } from "drizzle-orm";
import type { DiagnoseKnownRoleCommand } from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/command";
import type { KnownRoleDiagnostics } from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/port";
import type {
  DiagnoseKnownRoleResult,
  StoredJobDiagnostic,
} from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/result";
import { canonicalizeUrl, classifyUrl } from "@/contexts/discovery/infrastructure/job-sources/urls";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = typeof db;

export function createSqliteKnownRoleDiagnostics(database: Database): KnownRoleDiagnostics {
  return {
    diagnose(command) {
      return diagnoseKnownRole(database, command);
    },
  };
}

function diagnoseKnownRole(
  database: Database,
  command: DiagnoseKnownRoleCommand,
): DiagnoseKnownRoleResult {
  const run = database
    .select({ id: discoveryRuns.id, profileId: discoveryRuns.profileId })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, command.runId))
    .get();
  if (!run) {
    return { status: "run-not-found" };
  }

  const canonicalUrl = canonicalizeUrl(command.jobUrl);
  const sourceClassification = classifyUrl(canonicalUrl);
  const queries = database
    .select()
    .from(discoveryQueries)
    .where(eq(discoveryQueries.runId, run.id))
    .orderBy(discoveryQueries.id)
    .all();
  const relevantQueries = sourceClassification
    ? queries.filter((query) => query.atsType === sourceClassification.atsType)
    : [];
  const hit = database
    .select()
    .from(discoveryHits)
    .where(eq(discoveryHits.runId, run.id))
    .orderBy(discoveryHits.id)
    .all()
    .find((candidate) => safeCanonicalUrl(candidate.url) === canonicalUrl);
  const job = database
    .select()
    .from(jobs)
    .all()
    .find((candidate) => safeCanonicalUrl(candidate.canonicalUrl) === canonicalUrl);
  const match = job
    ? database
        .select()
        .from(jobMatches)
        .where(and(eq(jobMatches.profileId, run.profileId), eq(jobMatches.jobId, job.id)))
        .get()
    : undefined;
  const storedJob: StoredJobDiagnostic | null = job
    ? {
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        canonicalUrl: job.canonicalUrl,
        active: job.isActive,
        evidence: job.evidence,
      }
    : null;
  const matching: Extract<DiagnoseKnownRoleResult, { status: "diagnosed" }>["matching"] = match
    ? {
        code: match.status,
        score: match.score,
        reasons: match.reasons,
        exclusionReasons: match.exclusionReasons,
      }
    : {
        code: "not-evaluated",
        score: null,
        reasons: [],
        exclusionReasons: [],
      };

  return {
    status: "diagnosed",
    requestedUrl: command.jobUrl,
    canonicalUrl,
    profileId: run.profileId,
    source: sourceClassification
      ? { code: "supported-source", atsType: sourceClassification.atsType }
      : { code: "unsupported-source" },
    queryPlan:
      relevantQueries.length > 0
        ? {
            code: "query-planned",
            queries: relevantQueries.map((query) => ({
              id: query.id,
              atsType: query.atsType,
              sourcePattern: query.sourcePattern,
              titleTerm: query.titleTerm,
              status: query.status,
              providerResults: query.hitCount,
            })),
          }
        : { code: "no-query-planned", queries: [] },
    providerResponse: hit
      ? {
          code: "provider-returned",
          rank: hit.rank,
          queryId: queries.find((query) => query.queryText === hit.query)?.id ?? null,
        }
      : { code: "provider-not-returned" },
    classification: hit
      ? hit.atsType
        ? { code: "classified", atsType: hit.atsType }
        : { code: "unclassified" }
      : { code: "not-reached" },
    verification: storedJob
      ? !storedJob.active
        ? { code: "inactive", storedJob }
        : storedJob.evidence === "structured"
          ? { code: "verified", storedJob }
          : { code: "unverified", storedJob }
      : { code: "not-observed", storedJob: null },
    matching,
  };
}

function safeCanonicalUrl(value: string): string | null {
  try {
    return canonicalizeUrl(value);
  } catch {
    return null;
  }
}
