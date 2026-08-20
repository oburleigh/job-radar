import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { createJobDiscovery } from "../application/discovery-runs/discover/discover-jobs";
import { createDiscoveryRunExecution } from "../application/discovery-runs/execute/execute-discovery-run";
import { createDiscoveryRunStarter } from "../application/discovery-runs/start/start-discovery-run";
import { createAfterResponseDiscoveryRunScheduler } from "../infrastructure/background/after-response-discovery-run-scheduler";
import { getJobRadarConfig } from "../infrastructure/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "../infrastructure/configuration/sqlite-discovery-setup";
import { createSearchProvider } from "../infrastructure/search/web-search-provider";
import { createWebSearchProviderDirectory } from "../infrastructure/search/web-search-provider-directory";
import { db } from "../infrastructure/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "../infrastructure/sqlite/discovery-run-journal";
import { createSqliteDiscoveryRunRegistry } from "../infrastructure/sqlite/discovery-run-registry";
import { createSqliteDiscoveryRunStatusReader } from "../infrastructure/sqlite/sqlite-discovery-run-status-reader";
import { createSqliteJobDiscoveryCatalog } from "../infrastructure/sqlite/sqlite-job-discovery-catalog";
import { createSqliteJobMatchEvaluator } from "../infrastructure/sqlite/sqlite-job-match-evaluator";

const registry = createSqliteDiscoveryRunRegistry(db, {
  now: () => new Date(),
  staleAfterMs: () => getJobRadarConfig().ui.discoveryStaleAfterMs,
});
const execution = createDiscoveryRunExecution({
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
const scheduler = createAfterResponseDiscoveryRunScheduler({
  afterResponse: (callback) => {
    setImmediate(() => {
      void callback().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    });
  },
  discoveryRuns: execution,
  reportFailure: (message) => console.error(message),
});
const starter = createDiscoveryRunStarter({ registry, scheduler });
const statuses = createSqliteDiscoveryRunStatusReader(db);

export const discoveryRunsWeb = {
  assertProviderReady: createSearchProvider,
  failStale: () => registry.failStale(),
  isProviderConfigured: (name: string) => Boolean(getJobRadarConfig().searchProviders[name]),
  readStatuses: statuses.read.bind(statuses),
  startDiscoveryRun: starter.startDiscoveryRun.bind(starter),
};
