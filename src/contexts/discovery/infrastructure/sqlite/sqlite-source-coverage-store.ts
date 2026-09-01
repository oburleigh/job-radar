import { eq } from "drizzle-orm";

import type { SourceCoverageStore } from "@/contexts/discovery/application/source-coverage/set-enabled/port";
import { parseDiscoverySettings } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { db } from "./database";
import { appSettings, companyBoards, sourceDomains } from "./schema";

type Database = typeof db;

export function createSqliteSourceCoverageStore(database: Database): SourceCoverageStore {
  return {
    setSourceEnabled(sourceId, enabled) {
      database.update(sourceDomains).set({ enabled }).where(eq(sourceDomains.id, sourceId)).run();
    },
    setBoardEnabled(boardId, enabled) {
      database.update(companyBoards).set({ enabled }).where(eq(companyBoards.id, boardId)).run();
    },
    setCompanyBoardRefreshEnabled(enabled, changedAt) {
      const row = database
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "discovery"))
        .get();
      if (!row) {
        throw new Error("Discovery settings were not found");
      }
      const discovery = parseDiscoverySettings(row.value);
      database
        .update(appSettings)
        .set({
          value: { ...discovery, companyBoardRefreshEnabled: enabled },
          updatedAt: changedAt,
        })
        .where(eq(appSettings.key, "discovery"))
        .run();
    },
  };
}
