import { eq } from "drizzle-orm";

import type { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { searchProfiles, sourceDomains } from "@/contexts/discovery/adapters/driven/sqlite/schema";
import type { DiscoverySetupReader } from "@/contexts/discovery/hexagon/application/discovery-setup";

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
        profile,
        sources,
        policy: {
          resultsPerQuery: config.discovery.resultsPerQuery,
          boardJobLimit: config.discovery.boardJobLimit,
          searchFreshnessDays: config.discovery.searchFreshnessDays,
          workYieldBatchSize: config.discovery.workYieldBatchSize,
          titleSearchMode: provider?.titleSearchMode ?? config.discovery.titleSearchMode,
          worldwideRemoteTerms: [
            ...config.matching.remoteTerms,
            ...config.matching.unrestrictedRemotePhrases,
          ],
        },
      };
    },
  };
}
