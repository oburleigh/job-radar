import { getJobRadarConfig } from "@/config/job-radar";

import type { AtsType } from "./types";

export function getAtsLabels(): Record<AtsType, string> {
  const config = getJobRadarConfig();
  return Object.fromEntries(
    Object.entries(config.ats).map(([atsType, ats]) => [atsType, ats.label]),
  );
}
