import type { RuntimeSettingsCommand } from "./command";

export interface RuntimeSettingsStore {
  replace(settings: RuntimeSettingsCommand, changedAt: Date): void;
}
