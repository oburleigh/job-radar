import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";
import type { ResearchRunActivity } from "./public-contract";

export const recruiterResearchSettingsContract = {
  getDirectoryMatchWeights: recruiterEngagementWeb.getDirectoryMatchWeights,
  getExecutionSettings: recruiterEngagementWeb.getResearchExecutionSettings,
  saveExecutionSettings: recruiterEngagementWeb.saveResearchExecutionSettings,
  saveDirectoryMatchWeights: recruiterEngagementWeb.saveDirectoryMatchWeights,
};

export const recruiterActivityContract = {
  listResearchRuns: (): Promise<readonly ResearchRunActivity[]> =>
    recruiterEngagementWeb.listResearchRuns(),
};

export const recruiterAdapterSettingsContract = {
  getLinkedInReadiness: recruiterEngagementWeb.getLinkedInMcpReadiness,
  getLinkedInSettings: recruiterEngagementWeb.getLinkedInMcpSettings,
  saveLinkedInSettings: recruiterEngagementWeb.saveLinkedInMcpSettings,
};
