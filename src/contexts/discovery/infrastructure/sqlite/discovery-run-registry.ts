import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type {
  DiscoveryRunCancellation,
  DiscoveryRunRegistry,
  DiscoveryRunReservation,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  discoveryQueries,
  discoveryRuns,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = typeof db;

type SqliteDiscoveryRunRegistryOptions = {
  readonly now: () => Date;
  readonly staleAfterMs: () => number;
};

export type SqliteDiscoveryRunRegistry = DiscoveryRunRegistry & {
  readonly failStale: () => number;
};

export function createSqliteDiscoveryRunRegistry(
  database: Database,
  options: SqliteDiscoveryRunRegistryOptions,
): SqliteDiscoveryRunRegistry {
  function failStale(): number {
    const timestamp = options.now();
    const cutoff = new Date(timestamp.getTime() - options.staleAfterMs());
    return database
      .update(discoveryRuns)
      .set({
        status: "failed",
        error:
          "The local app stopped receiving progress from this discovery. Start a new run to retry.",
        finishedAt: timestamp,
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

  return {
    failStale,
    cancel({ runId, message, finishedAt }): DiscoveryRunCancellation {
      return database.transaction((transaction) => {
        const cancelChildQueries = () =>
          transaction
            .update(discoveryQueries)
            .set({ status: "cancelled", error: message, finishedAt })
            .where(
              and(
                eq(discoveryQueries.runId, runId),
                inArray(discoveryQueries.status, ["planned", "running"]),
              ),
            )
            .run();
        const run = transaction
          .select({ status: discoveryRuns.status })
          .from(discoveryRuns)
          .where(eq(discoveryRuns.id, runId))
          .get();
        if (!run) {
          return { status: "not-found", runId };
        }
        if (run.status === "completed" || run.status === "failed") {
          return { status: "already-terminal", runId, terminalStatus: run.status };
        }
        if (run.status === "cancelled") {
          cancelChildQueries();
          return { status: "already-terminal", runId, terminalStatus: run.status };
        }

        const cancelled = transaction
          .update(discoveryRuns)
          .set({ status: "cancelled", error: message, heartbeatAt: finishedAt, finishedAt })
          .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
          .run();
        if (cancelled.changes === 0) {
          const current = transaction
            .select({ status: discoveryRuns.status })
            .from(discoveryRuns)
            .where(eq(discoveryRuns.id, runId))
            .get();
          if (!current) {
            return { status: "not-found", runId };
          }
          if (
            current.status === "completed" ||
            current.status === "failed" ||
            current.status === "cancelled"
          ) {
            return { status: "already-terminal", runId, terminalStatus: current.status };
          }
          return { status: "not-found", runId };
        }

        cancelChildQueries();
        return { status: "cancelled", runId };
      });
    },
    fail({ runId, message, finishedAt }) {
      database
        .update(discoveryRuns)
        .set({ status: "failed", error: message, finishedAt })
        .where(and(eq(discoveryRuns.id, runId), eq(discoveryRuns.status, "running")))
        .run();
    },
    reserve({ profileId, providerName }): DiscoveryRunReservation {
      const persistedProviderName = providerName ?? "";
      const profile = database
        .select({ id: searchProfiles.id })
        .from(searchProfiles)
        .where(eq(searchProfiles.id, profileId))
        .get();
      if (!profile) {
        throw new Error(`Search profile ${profileId} was not found`);
      }

      failStale();

      return database.transaction((transaction) => {
        const existing = transaction
          .select({ id: discoveryRuns.id })
          .from(discoveryRuns)
          .where(and(eq(discoveryRuns.profileId, profileId), eq(discoveryRuns.status, "running")))
          .orderBy(desc(discoveryRuns.startedAt))
          .get();
        if (existing) {
          return { status: "already-running", runId: existing.id };
        }

        const timestamp = options.now();
        const run = transaction
          .insert(discoveryRuns)
          .values({
            profileId,
            provider: persistedProviderName,
            status: "running",
            phase: "known-boards",
            knownBoardCount: 0,
            knownBoardSuccessCount: 0,
            webCoverageStatus: "pending",
            startedAt: timestamp,
            heartbeatAt: timestamp,
          })
          .returning({ id: discoveryRuns.id })
          .get();
        if (!run) {
          throw new Error("Could not create a discovery run");
        }
        return { status: "created", runId: run.id };
      });
    },
  };
}
