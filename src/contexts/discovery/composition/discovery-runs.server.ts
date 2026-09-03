import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { createDiscoveryRunCanceller } from "@/contexts/discovery/application/discovery-runs/cancel/cancel-discovery-run";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import { createDiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/execute/execute-discovery-run";
import { createDiscoveryRunWorkPlanner } from "@/contexts/discovery/application/discovery-runs/start/plan-discovery-run-work";
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
import { createSqliteKnownBoardDiscoveryCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-known-board-discovery-catalog";

const registry = createSqliteDiscoveryRunRegistry(db, {
  now: () => new Date(),
  staleAfterMs: () => getJobRadarConfig().ui.discoveryStaleAfterMs,
});
const setup = createSqliteDiscoverySetup(db);
const jobs = createSqliteJobDiscoveryCatalog(db);
const knownBoards = createSqliteKnownBoardDiscoveryCatalog(db);
const execution = createDiscoveryRunExecution({
  discovery: createJobDiscovery({
    setup,
    runs: createSqliteDiscoveryRunJournal(db),
    knownBoards,
    jobs,
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
const starter = createDiscoveryRunStarter({
  work: createDiscoveryRunWorkPlanner({ setup, boards: knownBoards }),
  registry,
  scheduler,
});
const canceller = createDiscoveryRunCanceller({
  registry,
  scheduler,
  now: () => new Date(),
});
const statuses = createSqliteDiscoveryRunStatusReader(db, {
  now: () => new Date(),
  staleAfterMs: () => getJobRadarConfig().ui.discoveryStaleAfterMs,
});

export const discoveryRunsWeb = {
  assertProviderReady: createSearchProvider,
  isProviderKnown: (name: string) => Boolean(getJobRadarConfig().searchProviders[name]),
  isProviderConfigured: (name: string) => {
    const provider = getJobRadarConfig().searchProviders[name];
    return Boolean(provider && process.env[provider.apiKeyEnv]);
  },
  readStatuses: statuses.read.bind(statuses),
  cancelDiscoveryRun: canceller.cancelDiscoveryRun.bind(canceller),
  startDiscoveryRun: starter.startDiscoveryRun.bind(starter),
};
