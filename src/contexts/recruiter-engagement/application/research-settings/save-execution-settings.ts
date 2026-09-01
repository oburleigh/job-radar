import type { RecruiterResearchSettings } from "./settings";

export type ExecutionSettingsCommand = RecruiterResearchSettings["execution"];

export interface RecruiterResearchExecutionStore {
  readonly replaceExecution: (settings: ExecutionSettingsCommand, changedAt: Date) => void;
}

export function createSaveExecutionSettings(input: {
  readonly now: () => Date;
  readonly settings: RecruiterResearchExecutionStore;
}) {
  return (command: ExecutionSettingsCommand) => {
    input.settings.replaceExecution(command, input.now());
    return { status: "saved" as const };
  };
}
