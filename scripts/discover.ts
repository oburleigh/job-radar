import "dotenv/config";

import { eq } from "drizzle-orm";

import { buildBoardDiscoveryQueries, buildQueries } from "../src/application/discovery/queries";
import { getJobRadarConfig, supportsBoardSync } from "../src/infrastructure/config/job-radar";
import { db } from "../src/infrastructure/database/client";
import { searchProfiles, sourceDomains } from "../src/infrastructure/database/schema";
import { runDiscovery } from "../src/infrastructure/discovery/runner";
import {
  createSearchProvider,
  getSearchProviderOptions,
} from "../src/infrastructure/discovery/search";

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
    const roleQueries = buildQueries(
      profile,
      sources,
      config.searchProviders[providerName]?.titleSearchMode ?? config.discovery.titleSearchMode,
      [...config.matching.remoteTerms, ...config.matching.unrestrictedRemotePhrases],
    );
    const boardQueries = buildBoardDiscoveryQueries(
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

  const provider = createSearchProvider(providerName);
  const summary = await runDiscovery(profileId, provider, {
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
