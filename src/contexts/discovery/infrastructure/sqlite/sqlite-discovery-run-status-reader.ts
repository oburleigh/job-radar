import { desc, eq, inArray } from "drizzle-orm";

import { deriveDiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type { DiscoveryRunStatusReader } from "@/contexts/discovery/application/discovery-runs/status/port";
import { resolveDiscoveryRunProgress } from "@/contexts/discovery/domain/stale-discovery-run";
import type { db } from "./database";
import { discoveryRuns, searchProfiles } from "./schema";

type Database = typeof db;

type SqliteDiscoveryRunStatusReaderOptions = {
  readonly now: () => Date;
  readonly staleAfterMs: () => number;
};

export function createSqliteDiscoveryRunStatusReader(
  database: Database,
  options: SqliteDiscoveryRunStatusReaderOptions,
): DiscoveryRunStatusReader {
  return {
    read(query) {
      const policy = { now: options.now(), staleAfterMs: options.staleAfterMs() };
      const rows = database
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
          jobsUpserted: discoveryRuns.jobsUpserted,
          matchesFound: discoveryRuns.matchesFound,
          queryErrorCount: discoveryRuns.queryErrorCount,
          syncErrorCount: discoveryRuns.syncErrorCount,
          error: discoveryRuns.error,
          startedAt: discoveryRuns.startedAt,
          heartbeatAt: discoveryRuns.heartbeatAt,
        })
        .from(discoveryRuns)
        .innerJoin(searchProfiles, eq(searchProfiles.id, discoveryRuns.profileId))
        .where(
          query.ids.length > 0
            ? inArray(discoveryRuns.id, [...query.ids])
            : eq(discoveryRuns.status, "running"),
        )
        .orderBy(desc(discoveryRuns.startedAt))
        .all();
      const runs = rows.map(({ error, queryCount, startedAt, heartbeatAt, ...run }) => {
        const progress = resolveDiscoveryRunProgress(
          { status: run.status, error, startedAt, heartbeatAt },
          policy,
        );
        return {
          ...run,
          status: progress.status,
          outcome: deriveDiscoveryRunOutcome({
            status: progress.status,
            queryCount,
            queryErrorCount: run.queryErrorCount,
            syncErrorCount: run.syncErrorCount,
            knownBoardCount: run.knownBoardCount,
            knownBoardSuccessCount: run.knownBoardSuccessCount,
          }),
          errorSummary: progress.error.split("\n", 1)[0]?.trim().slice(0, 500) ?? "",
        };
      });
      const foundIds = new Set(runs.map((run) => run.id));
      return {
        runs,
        missingIds: query.ids.filter((id) => !foundIds.has(id)),
      };
    },
  };
}
