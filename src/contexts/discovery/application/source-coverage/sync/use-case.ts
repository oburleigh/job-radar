import type { BoardSynchronizer } from "./port";
import type { SyncSourceCoverageResult } from "./result";

interface SyncSourceCoverageDependencies {
  readonly boards: BoardSynchronizer;
}

export function createSyncSourceCoverage({ boards }: SyncSourceCoverageDependencies) {
  return async (): Promise<SyncSourceCoverageResult> => {
    const results = await boards.syncEnabledBoards();
    return {
      status: "completed",
      boardCount: results.length,
      writeCount: results.reduce((total, result) => total + result.created + result.updated, 0),
      failureCount: results.filter((result) => result.error).length,
    };
  };
}
