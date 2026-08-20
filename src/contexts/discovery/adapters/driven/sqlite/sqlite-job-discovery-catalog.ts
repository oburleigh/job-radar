import { eq } from "drizzle-orm";

import { supportsBoardSync } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import {
  type BoardIdentity,
  isBuiltInAtsType,
} from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { fetchLinkedInJob } from "@/contexts/discovery/adapters/driven/job-sources/linkedin";
import { inferLocationHint } from "@/contexts/discovery/adapters/driven/job-sources/search-result";
import {
  fetchStructuredJobPage,
  supportsStructuredJobPage,
} from "@/contexts/discovery/adapters/driven/job-sources/structured-job-page";
import { classifyUrl } from "@/contexts/discovery/adapters/driven/job-sources/urls";
import type { JobDiscoveryCatalog } from "@/contexts/discovery/hexagon/application/job-discovery-catalog";

import type { db } from "./database";
import { companyBoards, discoveryHits } from "./schema";
import {
  deactivateSearchJob,
  upsertSearchResult,
  upsertVerifiedSearchJob,
} from "./store-search-result";
import { syncBoard } from "./sync-boards";

type Database = typeof db;

export function createSqliteJobDiscoveryCatalog(database: Database): JobDiscoveryCatalog {
  const checkedLinkedInJobs = new Set<string>();
  const checkedStructuredJobPages = new Set<string>();

  return {
    async recordHit({ runId, query, rank, result, locationTerms, recordedAt }) {
      const classified = classifyUrl(result.url);
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
        jobsWritten += upsertSearchResult({
          atsType: classified.atsType,
          canonicalUrl: classified.canonicalUrl,
          externalId: classified.externalId,
          boardId: boardId ?? null,
          boardKey: classified.board?.canonicalKey ?? "",
          title: result.title,
          snippet: result.snippet,
          ...(!isBuiltInAtsType(classified.atsType)
            ? {
                locationHint: inferLocationHint([...locationTerms], {
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
            jobsWritten += upsertVerifiedSearchJob(lookup.job);
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
            jobsWritten += upsertVerifiedSearchJob(lookup.job);
          } else if (lookup.status === "closed" || lookup.status === "not_found") {
            deactivateSearchJob(classified.atsType, classified.externalId);
          }
        }
      }

      return {
        inserted: inserted.changes > 0,
        jobsWritten,
        ...(boardId !== undefined && classified && supportsBoardSync(classified.atsType)
          ? { syncableBoardId: boardId }
          : {}),
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
      const result = await syncBoard(board, jobLimit);
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
