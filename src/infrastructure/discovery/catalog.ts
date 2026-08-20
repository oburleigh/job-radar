import type { AtsType } from "@/application/discovery/types";
import { getJobRadarConfig } from "@/infrastructure/config/job-radar";

export function getAtsLabels(): Record<AtsType, string> {
  const config = getJobRadarConfig();
  return Object.fromEntries(
    Object.entries(config.ats).map(([atsType, ats]) => [atsType, ats.label]),
  );
}
