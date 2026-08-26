import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { atsIntegrations, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

export function getSettingsData() {
  const config = getJobRadarConfig();
  const sources = db.select().from(sourceDomains).orderBy(sourceDomains.priority).all();
  const integrations = db
    .select()
    .from(atsIntegrations)
    .orderBy(atsIntegrations.priority)
    .all()
    .map((integration) => ({
      ...integration,
      searchPatterns: sources
        .filter((source) => source.atsType === integration.atsType)
        .map((source) => source.pattern),
    }));

  return {
    network: config.network,
    discovery: config.discovery,
    ui: config.ui,
    matching: config.matching,
    marketVocabulary: config.marketVocabulary,
    searchProviders: config.searchProviders,
    integrationPolicy: config.integrationPolicy,
    profileDefaults: config.profileDefaults,
    integrations,
  };
}
