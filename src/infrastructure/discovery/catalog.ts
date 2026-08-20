import { getJobRadarConfig } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import type { AtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";

export function getAtsLabels(): Record<AtsType, string> {
  const config = getJobRadarConfig();
  return Object.fromEntries(
    Object.entries(config.ats).map(([atsType, ats]) => [atsType, ats.label]),
  );
}
