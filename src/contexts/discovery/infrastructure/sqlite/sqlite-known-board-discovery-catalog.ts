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
    async synchronizeEnabledBoards(jobLimit, observer) {
      const evidence = [];
      for (const board of enabledBoards()) {
        observer.boardStarted({ id: board.id, name: board.companyName || board.slug });
        const result = await syncBoard(board, jobLimit, database);
        const boardEvidence = {
          boardId: result.boardId,
          jobsWritten: result.created + result.updated,
          error: result.error,
        };
        evidence.push(boardEvidence);
        await observer.boardCompleted(boardEvidence);
      }
      return evidence;
    },
  };
}
