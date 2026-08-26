import type { MarketVocabulary } from "@/contexts/discovery/application/runtime-settings/settings";
import type { RuntimeSettingsCommand } from "./command";

export interface MarketVocabularyValidator {
  readonly isValid: (value: MarketVocabulary) => boolean;
}

export interface RuntimeSettingsStore {
  replace(settings: RuntimeSettingsCommand, changedAt: Date): void;
}
