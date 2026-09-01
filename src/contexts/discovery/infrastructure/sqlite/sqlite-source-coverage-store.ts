import { eq } from "drizzle-orm";

import type { SourceCoverageStore } from "@/contexts/discovery/application/source-coverage/set-enabled/port";
import type { db } from "./database";
import { companyBoards, sourceDomains } from "./schema";

type Database = typeof db;

export function createSqliteSourceCoverageStore(database: Database): SourceCoverageStore {
  return {
    setSourceEnabled(sourceId, enabled) {
      database.update(sourceDomains).set({ enabled }).where(eq(sourceDomains.id, sourceId)).run();
    },
    setBoardEnabled(boardId, enabled) {
      database.update(companyBoards).set({ enabled }).where(eq(companyBoards.id, boardId)).run();
    },
    setCompanyBoardsEnabled(enabled) {
      database.update(companyBoards).set({ enabled }).run();
    },
  };
}
