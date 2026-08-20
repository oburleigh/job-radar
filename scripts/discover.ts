import "dotenv/config";

import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { eq } from "drizzle-orm";
import {
  getJobRadarConfig,
  supportsBoardSync,
} from "../src/contexts/discovery/adapters/driven/configuration/job-radar-config";
import { createSqliteDiscoverySetup } from "../src/contexts/discovery/adapters/driven/configuration/sqlite-discovery-setup";
import { getSearchProviderOptions } from "../src/contexts/discovery/adapters/driven/search/web-search-provider";
import { createWebSearchProviderDirectory } from "../src/contexts/discovery/adapters/driven/search/web-search-provider-directory";
import { db } from "../src/contexts/discovery/adapters/driven/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "../src/contexts/discovery/adapters/driven/sqlite/discovery-run-journal";
import {
  searchProfiles,
  sourceDomains,
} from "../src/contexts/discovery/adapters/driven/sqlite/schema";
import { createSqliteJobDiscoveryCatalog } from "../src/contexts/discovery/adapters/driven/sqlite/sqlite-job-discovery-catalog";
import { createJobDiscovery } from "../src/contexts/discovery/hexagon/application/discover-jobs";
import {
  planBoardDiscoveryQueries,
  planSearchQueries,
} from "../src/contexts/discovery/hexagon/application/plan-search-queries";

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
