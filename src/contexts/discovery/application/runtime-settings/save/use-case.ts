import type { RuntimeSettingsCommand } from "./command";
import { findInvalidRuntimeSetting } from "./constraints";
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
    const invalidField = findInvalidRuntimeSetting(command);
    if (invalidField) {
      return { status: "rejected", reason: "invalid-setting", field: invalidField };
    }
    settings.replace(command, now());
    return { status: "saved" };
  };
}
