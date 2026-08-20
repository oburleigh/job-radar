import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { buildBoardDiscoveryQueries, buildQueries } from "@/application/discovery/queries";
import {
  type AtsType,
  type BoardIdentity,
  isBuiltInAtsType,
  type SearchHit,
  type SearchProvider,
} from "@/application/discovery/types";
import { getJobRadarConfig, supportsBoardSync } from "@/infrastructure/config/job-radar";
import { db } from "@/infrastructure/database/client";
import {
  companyBoards,
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  searchProfiles,
  sourceDomains,
} from "@/infrastructure/database/schema";
import { fetchLinkedInJob } from "./linkedin";
import { inferLocationHint } from "./search-result";
import { evaluateAndStore } from "./store-matches";
import {
  deactivateSearchJob,
  upsertSearchResult,
  upsertVerifiedSearchJob,
} from "./store-search-result";
import { fetchStructuredJobPage, supportsStructuredJobPage } from "./structured-job-page";
import { syncBoard } from "./sync";
import { classifyUrl } from "./urls";

export interface DiscoveryOptions {
  source?: AtsType;
  resultsPerQuery?: number;
  syncBoards?: boolean;
  boardJobLimit?: number;
  runId?: number;
}

export interface DiscoverySummary {
  runId: number;
  queries: number;
  hits: number;
  boards: number;
  jobs: number;
  matches: number;
  queryErrors: number;
  syncErrors: number;
}

export interface ReservedDiscoveryRun {
  runId: number;
  created: boolean;
}

export function failStaleDiscoveryRuns(now = new Date()): number {
  const cutoff = new Date(now.getTime() - getJobRadarConfig().ui.discoveryStaleAfterMs);
  return db
    .update(discoveryRuns)
    .set({
      status: "failed",
      error:
        "The local app stopped receiving progress from this discovery. Start a new run to retry.",
      finishedAt: now,
    })
    .where(
      and(
        eq(discoveryRuns.status, "running"),
        or(
          lt(discoveryRuns.heartbeatAt, cutoff),
          and(isNull(discoveryRuns.heartbeatAt), lt(discoveryRuns.startedAt, cutoff)),
        ),
      ),
    )
    .run().changes;
}

export function reserveDiscoveryRun(profileId: number, providerName: string): ReservedDiscoveryRun {
  const profile = db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(eq(searchProfiles.id, profileId))
    .get();
  if (!profile) {
    throw new Error(`Search profile ${profileId} was not found`);
  }

  failStaleDiscoveryRuns();

  return db.transaction((transaction) => {
    const existing = transaction
      .select({ id: discoveryRuns.id })
      .from(discoveryRuns)
      .where(and(eq(discoveryRuns.profileId, profileId), eq(discoveryRuns.status, "running")))
      .orderBy(desc(discoveryRuns.startedAt))
      .get();
    if (existing) {
      return { runId: existing.id, created: false };
    }

    const now = new Date();
    const run = transaction
      .insert(discoveryRuns)
      .values({
        profileId,
        provider: providerName,
        status: "running",
        startedAt: now,
        heartbeatAt: now,
      })
      .returning({ id: discoveryRuns.id })
      .get();
    if (!run) {
      throw new Error("Could not create a discovery run");
    }
    return { runId: run.id, created: true };
  });
}

export async function runDiscovery(
  profileId: number,
  provider: SearchProvider,
  options: DiscoveryOptions = {},
): Promise<DiscoverySummary> {
  const profile = db.select().from(searchProfiles).where(eq(searchProfiles.id, profileId)).get();
  if (!profile) {
    throw new Error(`Search profile ${profileId} was not found`);
  }

  const sources = db
    .select()
    .from(sourceDomains)
    .where(eq(sourceDomains.enabled, true))
    .all()
    .filter((source) => !options.source || source.atsType === options.source);
  const config = getJobRadarConfig();
  const providerConfig = config.searchProviders[provider.name];
  const searchMaxAgeDays =
    config.discovery.searchFreshnessDays > 0
      ? Math.min(profile.maxAgeDays, config.discovery.searchFreshnessDays)
      : profile.maxAgeDays;
  const roleQueries = buildQueries(
    profile,
    sources,
    providerConfig?.titleSearchMode ?? config.discovery.titleSearchMode,
    [...config.matching.remoteTerms, ...config.matching.unrestrictedRemotePhrases],
  );
  const boardQueries = buildBoardDiscoveryQueries(
    profile,
    sources.filter((source) => supportsBoardSync(source.atsType)),
  );
  const queries = [...roleQueries, ...boardQueries];
  const run = options.runId
    ? db
        .select({
          id: discoveryRuns.id,
          profileId: discoveryRuns.profileId,
          provider: discoveryRuns.provider,
        })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, options.runId))
        .get()
    : db
        .insert(discoveryRuns)
        .values({
          profileId,
          provider: provider.name,
          status: "running",
          queryCount: queries.length,
          startedAt: new Date(),
          heartbeatAt: new Date(),
        })
        .returning({
          id: discoveryRuns.id,
          profileId: discoveryRuns.profileId,
          provider: discoveryRuns.provider,
        })
        .get();

  if (!run || run.profileId !== profileId || run.provider !== provider.name) {
    throw new Error("The reserved discovery run is invalid");
  }
  if (options.runId) {
    db.update(discoveryRuns)
      .set({
        status: "running",
        queryCount: queries.length,
        hitCount: 0,
        boardsDiscovered: 0,
        jobsUpserted: 0,
        matchesFound: 0,
        queryErrorCount: 0,
        syncErrorCount: 0,
        error: "",
        heartbeatAt: new Date(),
        finishedAt: null,
      })
      .where(eq(discoveryRuns.id, run.id))
      .run();
  }
  const boardIds = new Set<number>();
  const queryErrors: string[] = [];
  let hitCount = 0;
  let jobWrites = 0;
  let matchedJobs = 0;
  let syncErrors = 0;
  let activeQueryId: number | null = null;
  let persistedQueries: Array<(typeof queries)[number] & { id: number }> = [];
  const checkedLinkedInJobs = new Set<string>();
  const checkedStructuredJobPages = new Set<string>();

  try {
    persistedQueries = queries.map((query) => {
      const row = db
        .insert(discoveryQueries)
        .values({
          runId: run.id,
          atsType: query.atsType,
          sourcePattern: query.sourcePattern,
          titleTerm: query.titleTerm,
          queryText: query.text,
        })
        .returning({ id: discoveryQueries.id })
        .get();
      if (!row) {
        throw new Error(`Could not persist discovery query for ${query.titleTerm}`);
      }
      return { ...query, id: row.id };
    });

    for (const query of persistedQueries) {
      activeQueryId = query.id;
      db.update(discoveryQueries)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(discoveryQueries.id, query.id))
        .run();
      let results: SearchHit[];
      let queryFailed = false;
      try {
        results = await provider.search(query.text, {
          count: options.resultsPerQuery ?? config.discovery.resultsPerQuery,
          maxAgeDays: searchMaxAgeDays,
        });
      } catch (error) {
        const message = errorMessage(error);
        queryErrors.push(`${query.sourcePattern} / ${query.titleTerm}: ${message}`);
        results = [];
        queryFailed = true;
        db.update(discoveryQueries)
          .set({
            status: "failed",
            error: message,
            finishedAt: new Date(),
          })
          .where(eq(discoveryQueries.id, query.id))
          .run();
      }

      for (const [index, result] of results.entries()) {
        const classified = classifyUrl(result.url);
        const boardId = classified?.board ? upsertBoard(classified.board) : null;
        if (boardId && classified && supportsBoardSync(classified.atsType)) {
          boardIds.add(boardId);
        }

        const inserted = db
          .insert(discoveryHits)
          .values({
            runId: run.id,
            query: query.text,
            rank: index + 1,
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            atsType: classified?.atsType,
            boardId,
            createdAt: new Date(),
          })
          .onConflictDoNothing()
          .run();
        hitCount += inserted.changes;

        if (classified) {
          jobWrites += upsertSearchResult({
            atsType: classified.atsType,
            canonicalUrl: classified.canonicalUrl,
            externalId: classified.externalId,
            boardId,
            boardKey: classified.board?.canonicalKey ?? "",
            title: result.title,
            snippet: result.snippet,
            ...(!isBuiltInAtsType(classified.atsType)
              ? {
                  locationHint: inferLocationHint(profile.locationTerms, {
                    title: result.title,
                    description: result.snippet,
                  }),
                }
              : {}),
          });
          if (
            classified.atsType === "linkedin" &&
            classified.externalId &&
            !checkedLinkedInJobs.has(classified.externalId)
          ) {
            checkedLinkedInJobs.add(classified.externalId);
            const lookup = await fetchLinkedInJob(classified.externalId, classified.canonicalUrl);
            if (lookup.status === "verified") {
              jobWrites += upsertVerifiedSearchJob(lookup.job);
            } else if (lookup.status === "closed" || lookup.status === "not_found") {
              deactivateSearchJob("linkedin", classified.externalId);
            }
          } else if (
            !isBuiltInAtsType(classified.atsType) &&
            classified.externalId &&
            supportsStructuredJobPage(classified.atsType) &&
            !checkedStructuredJobPages.has(classified.canonicalUrl)
          ) {
            checkedStructuredJobPages.add(classified.canonicalUrl);
            const lookup = await fetchStructuredJobPage(
              classified.atsType,
              classified.externalId,
              classified.canonicalUrl,
            );
            if (lookup.status === "verified") {
              jobWrites += upsertVerifiedSearchJob(lookup.job);
            } else if (lookup.status === "closed" || lookup.status === "not_found") {
              deactivateSearchJob(classified.atsType, classified.externalId);
            }
          }
        }
      }
      if (!queryFailed) {
        db.update(discoveryQueries)
          .set({
            status: "completed",
            hitCount: results.length,
            finishedAt: new Date(),
          })
          .where(eq(discoveryQueries.id, query.id))
          .run();
      }
      activeQueryId = null;
      updateDiscoveryProgress(run.id, {
        hitCount,
        jobsUpserted: jobWrites,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
      });
    }

    if (options.syncBoards !== false && boardIds.size > 0) {
      const boards = db
        .select()
        .from(companyBoards)
        .where(inArray(companyBoards.id, [...boardIds]))
        .all();
      for (const board of boards) {
        const result = await syncBoard(
          board,
          options.boardJobLimit ?? config.discovery.boardJobLimit,
        );
        jobWrites += result.created + result.updated;
        syncErrors += Number(Boolean(result.error));
        updateDiscoveryProgress(run.id, {
          hitCount,
          jobsUpserted: jobWrites,
          queryErrorCount: queryErrors.length,
          syncErrorCount: syncErrors,
        });
      }
    }

    const currentProfile =
      db.select().from(searchProfiles).where(eq(searchProfiles.id, profileId)).get() ?? profile;
    matchedJobs = (
      await evaluateAndStore(currentProfile, {
        onBatch: () =>
          updateDiscoveryProgress(run.id, {
            hitCount,
            jobsUpserted: jobWrites,
            queryErrorCount: queryErrors.length,
            syncErrorCount: syncErrors,
          }),
      })
    ).matched;
    const allQueriesFailed = queries.length > 0 && queryErrors.length === queries.length;
    db.update(discoveryRuns)
      .set({
        status: allQueriesFailed ? "failed" : "completed",
        hitCount,
        boardsDiscovered: boardIds.size,
        jobsUpserted: jobWrites,
        matchesFound: matchedJobs,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
        error: queryErrors.join("\n"),
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(discoveryRuns.id, run.id))
      .run();
  } catch (error) {
    if (activeQueryId) {
      db.update(discoveryQueries)
        .set({
          status: "failed",
          error: errorMessage(error),
          finishedAt: new Date(),
        })
        .where(eq(discoveryQueries.id, activeQueryId))
        .run();
    }
    db.update(discoveryRuns)
      .set({
        status: "failed",
        hitCount,
        boardsDiscovered: boardIds.size,
        jobsUpserted: jobWrites,
        matchesFound: matchedJobs,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
        error: errorMessage(error),
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(discoveryRuns.id, run.id))
      .run();
    throw error;
  }

  return {
    runId: run.id,
    queries: queries.length,
    hits: hitCount,
    boards: boardIds.size,
    jobs: jobWrites,
    matches: matchedJobs,
    queryErrors: queryErrors.length,
    syncErrors,
  };
}

interface DiscoveryProgress {
  hitCount: number;
  jobsUpserted: number;
  queryErrorCount: number;
  syncErrorCount: number;
}

function updateDiscoveryProgress(runId: number, progress: DiscoveryProgress): void {
  db.update(discoveryRuns)
    .set({
      ...progress,
      heartbeatAt: new Date(),
    })
    .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
    .run();
}

function upsertBoard(identity: BoardIdentity): number {
  const existing = db
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.canonicalKey, identity.canonicalKey))
    .get();
  const now = new Date();

  db.insert(companyBoards)
    .values({
      atsType: identity.atsType,
      canonicalKey: identity.canonicalKey,
      slug: identity.slug,
      baseUrl: identity.baseUrl,
      config: identity.config,
      enabled: true,
      discoveredAt: now,
    })
    .onConflictDoUpdate({
      target: companyBoards.canonicalKey,
      set: {
        atsType: identity.atsType,
        slug: identity.slug,
        baseUrl: identity.baseUrl,
        config: identity.config,
        enabled: true,
      },
    })
    .run();

  if (existing) {
    return existing.id;
  }
  const inserted = db
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.canonicalKey, identity.canonicalKey))
    .get();
  if (!inserted) {
    throw new Error(`Could not persist board ${identity.canonicalKey}`);
  }
  return inserted.id;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
