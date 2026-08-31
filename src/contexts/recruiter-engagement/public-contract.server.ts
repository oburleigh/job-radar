import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";
import type { ResearchRunActivity } from "./public-contract";

export const recruiterResearchSettingsContract = {
  getDirectoryMatchWeights: recruiterEngagementWeb.getDirectoryMatchWeights,
  getPublicSearchSettings: recruiterEngagementWeb.getPublicSearchSettings,
  getPublicSearchProviderOptions: recruiterEngagementWeb.getPublicSearchProviderOptions,
  savePublicSearchSettings: recruiterEngagementWeb.savePublicSearchSettings,
  saveDirectoryMatchWeights: recruiterEngagementWeb.saveDirectoryMatchWeights,
};

export const recruiterActivityContract = {
  listResearchRuns: (): Promise<readonly ResearchRunActivity[]> =>
    recruiterEngagementWeb.listResearchRuns(),
};
