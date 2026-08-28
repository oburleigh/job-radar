import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";

export const recruiterResearchSettingsContract = {
  getExecutionSettings: recruiterEngagementWeb.getResearchExecutionSettings,
  saveExecutionSettings: recruiterEngagementWeb.saveResearchExecutionSettings,
};
