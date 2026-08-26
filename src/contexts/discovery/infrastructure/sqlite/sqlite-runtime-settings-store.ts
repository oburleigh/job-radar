import type { RuntimeSettingsStore } from "@/contexts/discovery/application/runtime-settings/save/port";
import type { db } from "./database";
import { appSettings } from "./schema";

type Database = typeof db;

export function createSqliteRuntimeSettingsStore(database: Database): RuntimeSettingsStore {
  return {
    replace(settings, changedAt) {
      const rows = [
        { key: "network", value: settings.network },
        { key: "discovery", value: settings.discovery },
        { key: "matching", value: settings.matching },
        { key: "marketVocabulary", value: settings.marketVocabulary },
        { key: "ui", value: settings.ui },
        { key: "searchProviders", value: settings.searchProviders },
        { key: "integrationPolicy", value: settings.integrationPolicy },
        { key: "profileDefaults", value: settings.profileDefaults },
      ] as const;

      database.transaction((transaction) => {
        for (const row of rows) {
          transaction
            .insert(appSettings)
            .values({ ...row, updatedAt: changedAt })
            .onConflictDoUpdate({
              target: appSettings.key,
              set: { value: row.value, updatedAt: changedAt },
            })
            .run();
        }
      });
    },
  };
}
