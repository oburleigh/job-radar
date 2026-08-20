import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

export function getAtsLabels(): Record<AtsType, string> {
  const config = getJobRadarConfig();
  return Object.fromEntries(
    Object.entries(config.ats).map(([atsType, ats]) => [atsType, ats.label]),
  );
}
