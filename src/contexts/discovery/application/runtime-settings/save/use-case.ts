import type { RuntimeSettingsCommand } from "./command";
import type { RuntimeSettingsStore } from "./port";
import type { SaveRuntimeSettingsResult } from "./result";

interface SaveRuntimeSettingsDependencies {
  readonly settings: RuntimeSettingsStore;
  readonly now: () => Date;
}

export type SaveRuntimeSettings = (command: RuntimeSettingsCommand) => SaveRuntimeSettingsResult;

export function createSaveRuntimeSettings({
  settings,
  now,
}: SaveRuntimeSettingsDependencies): SaveRuntimeSettings {
  return (command) => {
    settings.replace(command, now());
    return { status: "saved" };
  };
}
