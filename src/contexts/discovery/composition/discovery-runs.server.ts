import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { createDiscoveryRunCanceller } from "@/contexts/discovery/application/discovery-runs/cancel/cancel-discovery-run";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import { createDiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/execute/execute-discovery-run";
import { createDiscoveryRunStarter } from "@/contexts/discovery/application/discovery-runs/start/start-discovery-run";
import { createAfterResponseDiscoveryRunScheduler } from "@/contexts/discovery/infrastructure/background/after-response-discovery-run-scheduler";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "@/contexts/discovery/infrastructure/configuration/sqlite-discovery-setup";
import { createSearchProvider } from "@/contexts/discovery/infrastructure/search/web-search-provider";
import { createWebSearchProviderDirectory } from "@/contexts/discovery/infrastructure/search/web-search-provider-directory";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "@/contexts/discovery/infrastructure/sqlite/discovery-run-journal";
import { createSqliteDiscoveryRunRegistry } from "@/contexts/discovery/infrastructure/sqlite/discovery-run-registry";
import { createSqliteDiscoveryRunStatusReader } from "@/contexts/discovery/infrastructure/sqlite/sqlite-discovery-run-status-reader";
import { createSqliteJobDiscoveryCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog";
import { createSqliteJobMatchEvaluator } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator";

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
const canceller = createDiscoveryRunCanceller({
  registry,
  scheduler,
  now: () => new Date(),
});
const statuses = createSqliteDiscoveryRunStatusReader(db);

export const discoveryRunsWeb = {
  assertProviderReady: createSearchProvider,
  failStale: () => registry.failStale(),
  isProviderConfigured: (name: string) => Boolean(getJobRadarConfig().searchProviders[name]),
  readStatuses: statuses.read.bind(statuses),
  cancelDiscoveryRun: canceller.cancelDiscoveryRun.bind(canceller),
  startDiscoveryRun: starter.startDiscoveryRun.bind(starter),
};
