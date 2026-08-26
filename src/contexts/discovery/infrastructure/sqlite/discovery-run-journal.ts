import { and, eq, sql } from "drizzle-orm";

import type { DiscoveryRunJournal } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";

import type { db } from "./database";
import { discoveryQueries, discoveryRuns } from "./schema";

type Database = typeof db;

export function createSqliteDiscoveryRunJournal(database: Database): DiscoveryRunJournal {
  return {
    prepare({ runId, profileId, providerName, startedAt }) {
      const run = runId
        ? database
            .select({
              id: discoveryRuns.id,
              profileId: discoveryRuns.profileId,
              providerName: discoveryRuns.provider,
              status: discoveryRuns.status,
            })
            .from(discoveryRuns)
            .where(eq(discoveryRuns.id, runId))
            .get()
        : database
            .insert(discoveryRuns)
            .values({
              profileId,
              provider: providerName,
              status: "running",
              queryCount: 0,
              startedAt,
              heartbeatAt: startedAt,
            })
            .returning({
              id: discoveryRuns.id,
              profileId: discoveryRuns.profileId,
              providerName: discoveryRuns.provider,
              status: discoveryRuns.status,
            })
            .get();

      if (
        !run ||
        run.profileId !== profileId ||
        run.providerName !== providerName ||
        (runId !== undefined && run.status !== "running")
      ) {
        throw new Error("The reserved discovery run is invalid");
      }
      if (runId) {
        const reset = database
          .update(discoveryRuns)
          .set({
            status: "running",
            queryCount: 0,
            hitCount: 0,
            boardsDiscovered: 0,
            jobsUpserted: 0,
            matchesFound: 0,
            queryErrorCount: 0,
            syncErrorCount: 0,
            error: "",
            heartbeatAt: startedAt,
            finishedAt: null,
          })
          .where(and(eq(discoveryRuns.id, run.id), eq(discoveryRuns.status, "running")))
          .run();
        if (reset.changes === 0) {
          throw new Error("The reserved discovery run is no longer running");
        }
      }
      return run;
    },
    admitRequest(runId, query) {
      return database.transaction((transaction) => {
        const accepted = transaction
          .update(discoveryRuns)
          .set({ queryCount: sql`${discoveryRuns.queryCount} + 1` })
          .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
          .run();
        if (accepted.changes === 0) {
          throw new Error("The discovery run is not accepting requests");
        }
        const row = transaction
          .insert(discoveryQueries)
          .values({
            runId,
            atsType: query.atsType,
            sourcePattern: query.sourcePattern,
            titleTerm: query.titleTerm,
            queryText: query.text,
            marketKey: query.marketKey,
            countryCode: query.countryCode,
            searchLanguage: query.searchLanguage,
            laneKind: query.laneKind,
            strategy: query.strategy,
            page: query.page,
          })
          .returning({ id: discoveryQueries.id })
          .get();
        if (!row) {
          throw new Error(`Could not persist discovery query for ${query.titleTerm}`);
        }
        return { ...query, id: row.id };
      });
    },
    startQuery(queryId, startedAt) {
      database
        .update(discoveryQueries)
        .set({ status: "running", startedAt })
        .where(and(eq(discoveryQueries.id, queryId), eq(discoveryQueries.status, "planned")))
        .run();
    },
    completeQuery(queryId, result) {
      database
        .update(discoveryQueries)
        .set({
          status: "completed",
          hitCount: result.hitCount,
          usefulHitCount: result.usefulHitCount,
          hasMore: result.hasMore,
          finishedAt: result.finishedAt,
        })
        .where(and(eq(discoveryQueries.id, queryId), eq(discoveryQueries.status, "running")))
        .run();
    },
    failQuery(queryId, message, finishedAt) {
      database
        .update(discoveryQueries)
        .set({ status: "failed", error: message, finishedAt })
        .where(and(eq(discoveryQueries.id, queryId), eq(discoveryQueries.status, "running")))
        .run();
    },
    cancelPendingRequests(runId, message, finishedAt) {
      database
        .update(discoveryQueries)
        .set({ status: "cancelled", error: message, finishedAt })
        .where(and(eq(discoveryQueries.runId, runId), eq(discoveryQueries.status, "planned")))
        .run();
    },
    recordProgress(runId, progress, recordedAt) {
      database
        .update(discoveryRuns)
        .set({ ...progress, heartbeatAt: recordedAt })
        .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
        .run();
    },
    complete({
      runId,
      progress,
      boardsDiscovered,
      matchesFound,
      errors,
      allQueriesFailed,
      finishedAt,
    }) {
      database
        .update(discoveryRuns)
        .set({
          status: allQueriesFailed ? "failed" : "completed",
          ...progress,
          boardsDiscovered,
          matchesFound,
          error: errors.join("\n"),
          heartbeatAt: finishedAt,
          finishedAt,
        })
        .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
        .run();
    },
    fail({ runId, progress, boardsDiscovered, matchesFound, message, finishedAt }) {
      database
        .update(discoveryRuns)
        .set({
          status: "failed",
          ...progress,
          boardsDiscovered,
          matchesFound,
          error: message,
          heartbeatAt: finishedAt,
          finishedAt,
        })
        .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
        .run();
    },
  };
}
