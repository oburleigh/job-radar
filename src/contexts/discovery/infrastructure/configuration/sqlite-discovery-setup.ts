import { eq } from "drizzle-orm";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import { createMarketResolver } from "@/contexts/discovery/infrastructure/markets/market-resolver";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { searchProfiles, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

import { getJobRadarConfig, supportsBoardSync } from "./job-radar-config";

type Database = typeof db;

export function createSqliteDiscoverySetup(database: Database): DiscoverySetupReader {
  return {
    load({ profileId, providerName, source }) {
      const profile = database
        .select()
        .from(searchProfiles)
        .where(eq(searchProfiles.id, profileId))
        .get();
      if (!profile) {
        throw new Error(`Search profile ${profileId} was not found`);
      }

      const config = getJobRadarConfig();
      const marketResolver = createMarketResolver(config.marketVocabulary);
      const provider = config.searchProviders[providerName];
      const sources = database
        .select()
        .from(sourceDomains)
        .where(eq(sourceDomains.enabled, true))
        .all()
        .filter((candidate) => !source || candidate.atsType === source)
        .map((candidate) => ({
          atsType: candidate.atsType,
          pattern: candidate.pattern,
          supportsBoardSync: supportsBoardSync(candidate.atsType),
        }));

      return {
        profile: {
          id: profile.id,
          titleTerms: profile.titleTerms,
          markets: profile.locationTerms.map((term) => marketResolver.resolve(term)),
          excludedMarkets: profile.excludedLocationTerms.map((term) =>
            marketResolver.resolve(term),
          ),
          includeRemote: profile.includeRemote,
          maxAgeDays: profile.maxAgeDays,
        },
        sources,
        policy: {
          resultsPerQuery: config.discovery.resultsPerQuery,
          boardJobLimit: config.discovery.boardJobLimit,
          searchFreshnessDays: config.discovery.searchFreshnessDays,
          workYieldBatchSize: config.discovery.workYieldBatchSize,
          strategies: provider?.strategies ?? config.discovery.strategies,
          worldwideRemoteTerms: [
            ...config.matching.remoteTerms,
            ...config.matching.unrestrictedRemotePhrases,
          ],
        },
      };
    },
  };
}
