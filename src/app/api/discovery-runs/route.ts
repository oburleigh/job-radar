import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { desc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { createAfterResponseDiscoveryRunScheduler } from "@/contexts/discovery/adapters/driven/background/after-response-discovery-run-scheduler";
import { getJobRadarConfig } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "@/contexts/discovery/adapters/driven/configuration/sqlite-discovery-setup";
import { createSearchProvider } from "@/contexts/discovery/adapters/driven/search/web-search-provider";
import { createWebSearchProviderDirectory } from "@/contexts/discovery/adapters/driven/search/web-search-provider-directory";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "@/contexts/discovery/adapters/driven/sqlite/discovery-run-journal";
import { createSqliteDiscoveryRunRegistry } from "@/contexts/discovery/adapters/driven/sqlite/discovery-run-registry";
import { discoveryRuns, searchProfiles } from "@/contexts/discovery/adapters/driven/sqlite/schema";
import { createSqliteJobDiscoveryCatalog } from "@/contexts/discovery/adapters/driven/sqlite/sqlite-job-discovery-catalog";
import { createSqliteJobMatchEvaluator } from "@/contexts/discovery/adapters/driven/sqlite/sqlite-job-match-evaluator";
import { createStartDiscoveryRunRoute } from "@/contexts/discovery/adapters/driving/web/start-discovery-run-route";
import { createJobDiscovery } from "@/contexts/discovery/hexagon/application/discover-jobs";
import { createDiscoveryRunExecution } from "@/contexts/discovery/hexagon/application/execute-discovery-run";
import { createDiscoveryRunStarter } from "@/contexts/discovery/hexagon/application/start-discovery-run";
import { assertLocalHost } from "@/platform/http/require-local-request";

const runRegistry = createSqliteDiscoveryRunRegistry(db, {
  now: () => new Date(),
  staleAfterMs: () => getJobRadarConfig().ui.discoveryStaleAfterMs,
});
const runExecution = createDiscoveryRunExecution({
  discovery: createJobDiscovery({
    setup: createSqliteDiscoverySetup(db),
    runs: createSqliteDiscoveryRunJournal(db),
    jobs: createSqliteJobDiscoveryCatalog(db),
    matches: createSqliteJobMatchEvaluator(db),
    providers: createWebSearchProviderDirectory(),
    now: () => new Date(),
    yieldControl: () => yieldToEventLoop(),
  }),
});
const runScheduler = createAfterResponseDiscoveryRunScheduler({
  afterResponse: after,
  discoveryRuns: runExecution,
  reportFailure: (message) => console.error(message),
});
const runStarter = createDiscoveryRunStarter({ registry: runRegistry, scheduler: runScheduler });
const startDiscoveryRun = createStartDiscoveryRunRoute({
  assertLocalRequest: (request) => assertLocalHost(request.headers.get("host") ?? ""),
  isProviderConfigured: (name) => Boolean(getJobRadarConfig().searchProviders[name]),
  assertProviderReady: (name) => {
    createSearchProvider(name);
  },
  discoveryRuns: runStarter,
});

const idsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isInteger(item) && item > 0),
  )
  .pipe(z.array(z.number().int().positive()).max(25));

export async function GET(request: Request) {
  assertLocalHost(request.headers.get("host") ?? "");
  runRegistry.failStale();
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const activeOnly = url.searchParams.get("active") === "1";
  const parsedIds = idsParam ? idsSchema.safeParse(idsParam) : null;
  if (parsedIds && !parsedIds.success) {
    return Response.json({ message: "Invalid discovery run ids." }, { status: 400 });
  }
  if (!parsedIds && !activeOnly) {
    return Response.json({ message: "Request run ids or active runs." }, { status: 400 });
  }

  const requestedIds = parsedIds?.data ?? [];
  const runs = db
    .select({
      id: discoveryRuns.id,
      profileId: discoveryRuns.profileId,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      hitCount: discoveryRuns.hitCount,
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
    .where(
      requestedIds.length > 0
        ? inArray(discoveryRuns.id, requestedIds)
        : eq(discoveryRuns.status, "running"),
    )
    .orderBy(desc(discoveryRuns.startedAt))
    .all();
  const foundIds = new Set(runs.map((run) => run.id));

  return Response.json(
    {
      runs,
      missingIds: requestedIds.filter((id) => !foundIds.has(id)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  return startDiscoveryRun(request);
}
