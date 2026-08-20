import "dotenv/config";

import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { eq } from "drizzle-orm";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import {
  planBoardDiscoveryQueries,
  planSearchQueries,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-queries";
import {
  getJobRadarConfig,
  supportsBoardSync,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "@/contexts/discovery/infrastructure/configuration/sqlite-discovery-setup";
import { getSearchProviderOptions } from "@/contexts/discovery/infrastructure/search/web-search-provider";
import { createWebSearchProviderDirectory } from "@/contexts/discovery/infrastructure/search/web-search-provider-directory";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "@/contexts/discovery/infrastructure/sqlite/discovery-run-journal";
import { searchProfiles, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";
import { createSqliteJobDiscoveryCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog";
import { createSqliteJobMatchEvaluator } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator";

async function main() {
  const args = process.argv.slice(2);
  const providerName = valueAfter(args, "--provider") ?? defaultProvider();
  const profileId = Number.parseInt(valueAfter(args, "--profile") ?? "1", 10);
  const sourceValue = valueAfter(args, "--source");
  const source = sourceValue || undefined;
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
    const roleQueries = planSearchQueries(
      profile,
      sources,
      config.searchProviders[providerName]?.titleSearchMode ?? config.discovery.titleSearchMode,
      [...config.matching.remoteTerms, ...config.matching.unrestrictedRemotePhrases],
    );
    const boardQueries = planBoardDiscoveryQueries(
      profile,
      sources.filter((item) => supportsBoardSync(item.atsType)),
    );
    const queries = [...roleQueries, ...boardQueries];
    for (const query of queries) {
      console.log(`[${query.atsType}] ${query.text}`);
    }
    console.log(`${queries.length} queries`);
    return;
  }

  const discovery = createJobDiscovery({
    setup: createSqliteDiscoverySetup(db),
    runs: createSqliteDiscoveryRunJournal(db),
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
