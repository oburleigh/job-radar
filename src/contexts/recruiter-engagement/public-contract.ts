export { DirectoryMatchSettingsForm } from "./presentation/web/directory-match-settings-form";
export { PublicSearchSettingsForm } from "./presentation/web/public-search-settings-form";
export { parseDirectoryMatchSettingsRequest } from "./presentation/web/requests/directory-match-settings-request";
export { parsePublicSearchSettingsRequest } from "./presentation/web/requests/public-search-settings-request";

import type { ResearchRun } from "./domain/research-run";

export type ResearchRunActivity = Pick<
  ResearchRun,
  "brief" | "checkpoint" | "completionReason" | "id" | "startedAt" | "status"
>;
