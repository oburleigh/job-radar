export { parseDirectoryMatchSettingsRequest } from "./presentation/web/requests/directory-match-settings-request";
export { parsePublicSearchSettingsRequest } from "./presentation/web/requests/public-search-settings-request";
export { parseResearchCriteriaOptionsRequest } from "./presentation/web/requests/research-criteria-options-request";

import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";
import { isActiveResearchRunActivity, type ResearchRunActivity } from "./public-contract";

export const recruiterResearchSettingsContract = {
  getDirectoryMatchWeights: recruiterEngagementWeb.getDirectoryMatchWeights,
  getPublicSearchSettings: recruiterEngagementWeb.getPublicSearchSettings,
  getResearchCriteriaOptions: recruiterEngagementWeb.getResearchCriteriaOptions,
  getPublicSearchProviderOptions: recruiterEngagementWeb.getPublicSearchProviderOptions,
  savePublicSearchSettings: recruiterEngagementWeb.savePublicSearchSettings,
  saveResearchCriteriaOptions: recruiterEngagementWeb.saveResearchCriteriaOptions,
  saveDirectoryMatchWeights: recruiterEngagementWeb.saveDirectoryMatchWeights,
};

export const recruiterActivityContract = {
  listResearchRuns: (): Promise<readonly ResearchRunActivity[]> =>
    recruiterEngagementWeb.listResearchRuns(),
  countActiveResearchRuns: async (): Promise<number> =>
    (await recruiterEngagementWeb.listResearchRuns()).filter(isActiveResearchRunActivity).length,
};
