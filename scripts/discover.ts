import "dotenv/config";

import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { eq } from "drizzle-orm";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import { planSearchLanes } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import {
  getJobRadarConfig,
  supportsBoardSync,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "@/contexts/discovery/infrastructure/configuration/sqlite-discovery-setup";
import { createMarketResolver } from "@/contexts/discovery/infrastructure/markets/market-resolver";
import {
  getSearchProviderOptions,
  renderSearchLane,
} from "@/contexts/discovery/infrastructure/search/web-search-provider";
import { createWebSearchProviderDirectory } from "@/contexts/discovery/infrastructure/search/web-search-provider-directory";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "@/contexts/discovery/infrastructure/sqlite/discovery-run-journal";
import { readDiscoveryBenchmark } from "@/contexts/discovery/infrastructure/sqlite/read-models/discovery-benchmark";
import { searchProfiles, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";
import { createSqliteJobDiscoveryCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog";
import { createSqliteJobMatchEvaluator } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator";
import { createSqliteKnownBoardDiscoveryCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-known-board-discovery-catalog";

async function main() {
  const args = process.argv.slice(2);
  const providerName = valueAfter(args, "--provider") ?? defaultProvider();
  const profileId = Number.parseInt(valueAfter(args, "--profile") ?? "1", 10);
  const sourceValue = valueAfter(args, "--source");
  const source = sourceValue || undefined;
  const benchmarkUrl = valueAfter(args, "--benchmark-url");
  const dryRun = args.includes("--dry-run");

  const profile = db.select().from(searchProfiles).where(eq(searchProfiles.id, profileId)).get();
  if (!profile) {
    throw new Error(`Search profile ${profileId} was not found`);
  }
  if (
    source &&
    !db
      .select({ id: sourceDomains.id })
      .from(sourceDomains)
      .where(eq(sourceDomains.atsType, source))
      .get()
  ) {
    throw new Error(`Search source ${source} was not found`);
  }

  if (dryRun) {
    const config = getJobRadarConfig();
    const sources = db
      .select()
      .from(sourceDomains)
      .where(eq(sourceDomains.enabled, true))
      .all()
      .filter((item) => !source || item.atsType === source);
    const marketResolver = createMarketResolver(config.marketVocabulary);
    const markets = profile.locationTerms.map((term) => marketResolver.resolve(term));
    const lanes = planSearchLanes(
      {
        titleTerms: profile.titleTerms,
        markets,
        includeRemote: profile.includeRemote,
      },
      sources.map((item) => ({ ...item, supportsBoardSync: supportsBoardSync(item.atsType) })),
      config.searchProviders[providerName]?.strategies ?? config.discovery.strategies,
      [...config.matching.remoteTerms, ...config.matching.unrestrictedRemotePhrases],
    );
    for (const lane of lanes) {
      console.log(`[${lane.source.atsType}] ${renderSearchLane(lane)}`);
    }
    console.log(`${lanes.length} requests`);
    return;
  }

  const discovery = createJobDiscovery({
    setup: createSqliteDiscoverySetup(db),
    runs: createSqliteDiscoveryRunJournal(db),
    knownBoards: createSqliteKnownBoardDiscoveryCatalog(db),
    jobs: createSqliteJobDiscoveryCatalog(db),
    matches: createSqliteJobMatchEvaluator(db),
    providers: createWebSearchProviderDirectory(),
    now: () => new Date(),
    yieldControl: () => yieldToEventLoop(),
  });
  const summary = await discovery.discoverJobs({
    profileId,
    providerName,
    ...(source ? { source } : {}),
  });
  if (benchmarkUrl) {
    const config = getJobRadarConfig();
    console.log(
      JSON.stringify(
        readDiscoveryBenchmark(db, {
          runId: summary.runId,
          profileId,
          knownRoleUrl: benchmarkUrl,
          benchmarkedAt: new Date(),
          policy: {
            resultsPerQuery: config.discovery.resultsPerQuery,
            boardJobLimit: config.discovery.boardJobLimit,
            searchFreshnessDays: config.discovery.searchFreshnessDays,
            strategies:
              config.searchProviders[providerName]?.strategies ?? config.discovery.strategies,
            matching: config.matching,
          },
        }),
        null,
        2,
      ),
    );
    return;
  }
  console.log(summary);
}

function valueAfter(values: string[], flag: string): string | undefined {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}

function defaultProvider(): string {
  const providers = getSearchProviderOptions();
  return providers.find((provider) => provider.configured)?.name ?? providers[0]?.name ?? "serper";
}
void main();
