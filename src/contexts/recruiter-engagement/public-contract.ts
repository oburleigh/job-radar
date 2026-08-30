export { DirectoryMatchSettingsForm } from "./presentation/web/directory-match-settings-form";
export { parseDirectoryMatchSettingsRequest } from "./presentation/web/requests/directory-match-settings-request";
export { parseResearchExecutionSettingsRequest } from "./presentation/web/requests/research-execution-settings-request";
export { ResearchExecutionSettingsForm } from "./presentation/web/research-execution-settings-form";

import type { ResearchRun } from "./domain/research-run";

export type ResearchRunActivity = Pick<
  ResearchRun,
  "brief" | "checkpoint" | "completionReason" | "id" | "startedAt" | "status"
>;
