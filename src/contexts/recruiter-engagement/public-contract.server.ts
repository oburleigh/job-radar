import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";

export const recruiterResearchSettingsContract = {
  getDirectoryMatchWeights: recruiterEngagementWeb.getDirectoryMatchWeights,
  getExecutionSettings: recruiterEngagementWeb.getResearchExecutionSettings,
  saveExecutionSettings: recruiterEngagementWeb.saveResearchExecutionSettings,
  saveDirectoryMatchWeights: recruiterEngagementWeb.saveDirectoryMatchWeights,
};
