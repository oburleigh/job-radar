import { eq } from "drizzle-orm";
import type { KnownBoardDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/known-board-discovery";
import type { db } from "./database";
import { companyBoards } from "./schema";
import { syncBoard } from "./sync-boards";

type Database = typeof db;

export function createSqliteKnownBoardDiscoveryCatalog(
  database: Database,
): KnownBoardDiscoveryCatalog {
  const enabledBoards = () =>
    database.select().from(companyBoards).where(eq(companyBoards.enabled, true)).all();

  return {
    countEnabledBoards: () => enabledBoards().length,
    async synchronizeEnabledBoards(jobLimit) {
      const evidence = [];
      for (const board of enabledBoards()) {
        const result = await syncBoard(board, jobLimit, database);
        evidence.push({
          boardId: result.boardId,
          jobsWritten: result.created + result.updated,
          error: result.error,
        });
      }
      return evidence;
    },
  };
}
