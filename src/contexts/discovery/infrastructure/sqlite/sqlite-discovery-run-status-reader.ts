import { desc, eq, inArray } from "drizzle-orm";

import { deriveDiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type { DiscoveryRunStatusReader } from "@/contexts/discovery/application/discovery-runs/status/port";
import type { db } from "./database";
import { discoveryRuns, searchProfiles } from "./schema";

type Database = typeof db;

export function createSqliteDiscoveryRunStatusReader(database: Database): DiscoveryRunStatusReader {
  return {
    read(query) {
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
      const runs = rows.map(({ error, queryCount, ...run }) => ({
        ...run,
        outcome: deriveDiscoveryRunOutcome({
          status: run.status,
          queryCount,
          queryErrorCount: run.queryErrorCount,
          syncErrorCount: run.syncErrorCount,
          knownBoardCount: run.knownBoardCount,
          knownBoardSuccessCount: run.knownBoardSuccessCount,
        }),
        errorSummary: error.split("\n", 1)[0]?.trim().slice(0, 500) ?? "",
      }));
      const foundIds = new Set(runs.map((run) => run.id));
      return {
        runs,
        missingIds: query.ids.filter((id) => !foundIds.has(id)),
      };
    },
  };
}
