export { DirectoryMatchSettingsForm } from "./presentation/web/directory-match-settings-form";
export { PublicSearchSettingsForm } from "./presentation/web/public-search-settings-form";
export { ResearchCriteriaOptionsForm } from "./presentation/web/research-criteria-options-form";

import { isRunAcceptingObservations, type ResearchRun } from "./domain/research-run";

export type ResearchRunActivity = Pick<
  ResearchRun,
  "brief" | "checkpoint" | "completionReason" | "id" | "startedAt" | "status"
>;

export function isActiveResearchRunActivity(run: ResearchRunActivity): boolean {
  return isRunAcceptingObservations(run);
}
