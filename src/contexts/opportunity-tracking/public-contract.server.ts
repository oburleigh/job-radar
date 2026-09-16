import { opportunityAdvisor } from "./composition/advisor.server";
import { opportunityTracking } from "./composition/opportunity-tracking.server";
import { parseAdvisorSettingsRequest } from "./presentation/web/requests/advisor-settings-request";

export const opportunityTrackingContract = opportunityTracking;

export const opportunityAdvisorContract = {
  ...opportunityAdvisor,
  parseSettingsRequest: parseAdvisorSettingsRequest,
};
