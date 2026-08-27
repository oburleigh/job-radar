import type { MarketVocabulary } from "@/contexts/discovery/application/runtime-settings/settings";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

export function getConfiguredMarketVocabulary(): MarketVocabulary {
  return getJobRadarConfig().marketVocabulary;
}
