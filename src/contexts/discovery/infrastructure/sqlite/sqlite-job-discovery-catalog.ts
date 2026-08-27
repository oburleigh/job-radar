import { eq } from "drizzle-orm";
import type { JobDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/job-discovery-catalog";
import {
  getJobRadarConfig,
  supportsBoardSync,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import {
  type lookupAtsPosting,
  supportsAtsPostingLookup,
} from "@/contexts/discovery/infrastructure/job-sources/adapters";
import {
  type BoardIdentity,
  isBuiltInAtsType,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { fetchLinkedInJob } from "@/contexts/discovery/infrastructure/job-sources/linkedin";
import { inferLocationHint } from "@/contexts/discovery/infrastructure/job-sources/search-result";
import {
  fetchStructuredJobPage,
  supportsStructuredJobPage,
} from "@/contexts/discovery/infrastructure/job-sources/structured-job-page";
import { classifyUrlWithConfig } from "@/contexts/discovery/infrastructure/job-sources/url-classification";

import type { db } from "./database";
import { companyBoards, discoveryHits } from "./schema";
import {
  deactivateSearchJob,
  recordStructuredJobPageOutcome,
  upsertSearchResult,
  upsertVerifiedSearchJob,
} from "./store-search-result";
import { syncBoard } from "./sync-boards";
import {
  type ExactAtsHitOutcome,
  recordExactAtsHitOutcome,
  verifyExactAtsPosting,
} from "./verify-exact-ats-posting";

type Database = typeof db;

interface SqliteJobDiscoveryCatalogDependencies {
  readonly lookupStructuredJobPage?: typeof fetchStructuredJobPage;
  readonly lookupAtsPosting?: typeof lookupAtsPosting;
}

export function createSqliteJobDiscoveryCatalog(
  database: Database,
  dependencies: SqliteJobDiscoveryCatalogDependencies = {},
): JobDiscoveryCatalog {
  const lookupStructuredJobPage = dependencies.lookupStructuredJobPage ?? fetchStructuredJobPage;
  const exactAtsPostingOutcomes = new Map<string, ExactAtsHitOutcome>();
  const checkedLinkedInJobs = new Set<string>();
  const checkedStructuredJobPages = new Set<string>();

  return {
    async recordHit({ runId, query, rank, result, marketScopes, recordedAt }) {
      const classified = classifyUrlWithConfig(result.url, getJobRadarConfig(database).ats);
      const boardId = classified?.board
        ? upsertBoard(database, classified.board, recordedAt)
        : undefined;
      const inserted = database
        .insert(discoveryHits)
        .values({
          runId,
          query,
          rank,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          atsType: classified?.atsType,
          boardId,
          createdAt: recordedAt,
        })
        .onConflictDoNothing()
        .run();
      let jobsWritten = 0;

      if (classified) {
        const searchResult = {
          atsType: classified.atsType,
          canonicalUrl: classified.canonicalUrl,
          externalId: classified.externalId,
          boardId: boardId ?? null,
          boardKey: classified.board?.canonicalKey ?? "",
          title: result.title,
          snippet: result.snippet,
          ...(!isBuiltInAtsType(classified.atsType)
            ? {
                locationHint: inferLocationHint(
                  marketScopes.flatMap((market) => market.terms),
                  {
                    title: result.title,
                    description: result.snippet,
                  },
                ),
              }
            : {}),
        };
        const canLookupStructuredPage =
          Boolean(classified.externalId) && supportsStructuredJobPage(classified.atsType, database);
        const shouldLookupStructuredPage =
          canLookupStructuredPage && !checkedStructuredJobPages.has(classified.canonicalUrl);
        const exactPostingKey =
          classified.externalId && supportsAtsPostingLookup(classified.atsType)
            ? [
                runId,
                classified.atsType,
                boardId ?? classified.board?.canonicalKey ?? "unresolved",
                classified.externalId,
              ].join("|")
            : null;
        let exactVerification = null;
        if (exactPostingKey) {
          const cachedOutcome = exactAtsPostingOutcomes.get(exactPostingKey);
          if (cachedOutcome) {
            recordExactAtsHitOutcome(database, {
              runId,
              url: result.url,
              ...cachedOutcome,
            });
            exactVerification = { jobsWritten: 0, outcome: cachedOutcome };
          } else {
            exactVerification = await verifyExactAtsPosting({
              database,
              classification: classified,
              discoveredBoardId: boardId,
              searchResult,
              runId,
              hitUrl: result.url,
              checkedAt: recordedAt,
              ...(dependencies.lookupAtsPosting
                ? { lookupPosting: dependencies.lookupAtsPosting }
                : {}),
            });
            if (exactVerification) {
              exactAtsPostingOutcomes.set(exactPostingKey, exactVerification.outcome);
            }
          }
        }

        if (exactVerification !== null) {
          jobsWritten += exactVerification.jobsWritten;
        } else if (shouldLookupStructuredPage) {
          checkedStructuredJobPages.add(classified.canonicalUrl);
          const lookup = await lookupStructuredJobPage(
            classified.atsType,
            classified.externalId,
            classified.canonicalUrl,
          );
          if (lookup.status === "verified") {
            jobsWritten += upsertVerifiedSearchJob(lookup.job, database);
          } else {
            jobsWritten += upsertSearchResult(searchResult, database);
            recordStructuredJobPageOutcome(
              classified.atsType,
              classified.externalId,
              lookup,
              recordedAt,
              database,
            );
          }
        } else if (!canLookupStructuredPage) {
          jobsWritten += upsertSearchResult(searchResult, database);
        }

        if (
          classified.atsType === "linkedin" &&
          classified.externalId &&
          !checkedLinkedInJobs.has(classified.externalId)
        ) {
          checkedLinkedInJobs.add(classified.externalId);
          const lookup = await fetchLinkedInJob(classified.externalId, classified.canonicalUrl);
          if (lookup.status === "verified") {
            jobsWritten += upsertVerifiedSearchJob(lookup.job, database);
          } else if (lookup.status === "closed" || lookup.status === "not_found") {
            deactivateSearchJob("linkedin", classified.externalId, database);
          }
        }
      }

      const wasInserted = inserted.changes > 0;
      const syncableBoardId =
        boardId !== undefined && classified && supportsBoardSync(classified.atsType, database)
          ? boardId
          : undefined;
      return {
        inserted: wasInserted,
        isUseful:
          wasInserted &&
          (Boolean(classified?.externalId) || syncableBoardId !== undefined || jobsWritten > 0),
        jobsWritten,
        ...(syncableBoardId === undefined ? {} : { syncableBoardId }),
      };
    },
    async synchronizeBoard(boardId, jobLimit) {
      const board = database
        .select()
        .from(companyBoards)
        .where(eq(companyBoards.id, boardId))
        .get();
      if (!board) {
        throw new Error(`Discovered board ${boardId} was not found`);
      }
      const result = await syncBoard(board, jobLimit, database);
      return { jobsWritten: result.created + result.updated, error: result.error };
    },
  };
}

function upsertBoard(database: Database, identity: BoardIdentity, recordedAt: Date): number {
  const existing = database
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.canonicalKey, identity.canonicalKey))
    .get();

  database
    .insert(companyBoards)
    .values({
      atsType: identity.atsType,
      canonicalKey: identity.canonicalKey,
      slug: identity.slug,
      baseUrl: identity.baseUrl,
      config: identity.config,
      enabled: true,
      discoveredAt: recordedAt,
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
  const inserted = database
    .select({ id: companyBoards.id })
    .from(companyBoards)
    .where(eq(companyBoards.canonicalKey, identity.canonicalKey))
    .get();
  if (!inserted) {
    throw new Error(`Could not persist board ${identity.canonicalKey}`);
  }
  return inserted.id;
}
