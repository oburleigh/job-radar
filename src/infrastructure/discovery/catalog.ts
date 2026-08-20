import type { AtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { getJobRadarConfig } from "@/infrastructure/config/job-radar";

export function getAtsLabels(): Record<AtsType, string> {
  const config = getJobRadarConfig();
  return Object.fromEntries(
    Object.entries(config.ats).map(([atsType, ats]) => [atsType, ats.label]),
  );
}
