export { DirectoryMatchSettingsForm } from "./presentation/web/directory-match-settings-form";
export { PublicSearchSettingsForm } from "./presentation/web/public-search-settings-form";
export { parseDirectoryMatchSettingsRequest } from "./presentation/web/requests/directory-match-settings-request";
export { parsePublicSearchSettingsRequest } from "./presentation/web/requests/public-search-settings-request";
export { parseResearchCriteriaOptionsRequest } from "./presentation/web/requests/research-criteria-options-request";
export { ResearchCriteriaOptionsForm } from "./presentation/web/research-criteria-options-form";

import { isRunAcceptingObservations, type ResearchRun } from "./domain/research-run";

export type ResearchRunActivity = Pick<
  ResearchRun,
  "brief" | "checkpoint" | "completionReason" | "id" | "startedAt" | "status"
>;

export function isActiveResearchRunActivity(run: ResearchRunActivity): boolean {
  return isRunAcceptingObservations(run);
}
