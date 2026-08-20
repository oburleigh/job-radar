import type { BoardSynchronizer } from "../../application/source-coverage/sync/port";
import { syncEnabledBoards } from "./sync-boards";

export const sqliteBoardSynchronizer: BoardSynchronizer = {
  syncEnabledBoards,
};
