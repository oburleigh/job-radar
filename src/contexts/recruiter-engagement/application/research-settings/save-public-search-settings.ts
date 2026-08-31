import type { RecruiterResearchSettings } from "./settings";

export type PublicSearchSettingsCommand = RecruiterResearchSettings["publicSearch"];

export interface RecruiterResearchSettingsStore {
  readonly replacePublicSearch: (settings: PublicSearchSettingsCommand, changedAt: Date) => void;
}

export function createSavePublicSearchSettings(input: {
  readonly now: () => Date;
  readonly settings: RecruiterResearchSettingsStore;
}) {
  return (command: PublicSearchSettingsCommand) => {
    input.settings.replacePublicSearch(command, input.now());
    return { status: "saved" as const };
  };
}
