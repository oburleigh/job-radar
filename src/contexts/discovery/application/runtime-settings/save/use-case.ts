import type { RuntimeSettingsCommand } from "./command";
import { findInvalidRuntimeSetting } from "./constraints";
import type { MarketVocabularyValidator, RuntimeSettingsStore } from "./port";
import type { SaveRuntimeSettingsResult } from "./result";

interface SaveRuntimeSettingsDependencies {
  readonly marketVocabulary: MarketVocabularyValidator;
  readonly settings: RuntimeSettingsStore;
  readonly now: () => Date;
}

export type SaveRuntimeSettings = (command: RuntimeSettingsCommand) => SaveRuntimeSettingsResult;

export function createSaveRuntimeSettings({
  marketVocabulary,
  settings,
  now,
}: SaveRuntimeSettingsDependencies): SaveRuntimeSettings {
  return (command) => {
    const invalidField = findInvalidRuntimeSetting(command);
    if (invalidField) {
      return { status: "rejected", reason: "invalid-setting", field: invalidField };
    }
    if (!marketVocabulary.isValid(command.marketVocabulary)) {
      return { status: "rejected", reason: "invalid-setting", field: "marketVocabulary" };
    }
    settings.replace(command, now());
    return { status: "saved" };
  };
}
