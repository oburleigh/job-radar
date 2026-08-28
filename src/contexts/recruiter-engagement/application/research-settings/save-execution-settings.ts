import type { RecruiterResearchSettings } from "./settings";

export type ResearchExecutionSettingsCommand = Pick<
  RecruiterResearchSettings["execution"],
  "model" | "reasoningEffort"
>;

export interface RecruiterResearchSettingsStore {
  readonly replaceExecution: (execution: ResearchExecutionSettingsCommand, changedAt: Date) => void;
}

type SaveResearchExecutionSettingsDependencies = {
  readonly now: () => Date;
  readonly settings: RecruiterResearchSettingsStore;
};

export type SaveResearchExecutionSettings = (command: ResearchExecutionSettingsCommand) => {
  readonly status: "saved";
};

export function createSaveResearchExecutionSettings({
  now,
  settings,
}: SaveResearchExecutionSettingsDependencies): SaveResearchExecutionSettings {
  return (command) => {
    settings.replaceExecution(command, now());
    return { status: "saved" };
  };
}
