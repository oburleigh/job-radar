import { asc, desc, eq } from "drizzle-orm";

import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  discoveryQueries,
  discoveryRuns,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

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
  const run = db
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

  const queries = db
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

  return { run, queries, summary };
}
