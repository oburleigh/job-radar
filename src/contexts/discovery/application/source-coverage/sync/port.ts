export interface BoardSyncResult {
  readonly created: number;
  readonly updated: number;
  readonly error?: string;
}

export interface BoardSynchronizer {
  syncEnabledBoards(): Promise<readonly BoardSyncResult[]>;
}
