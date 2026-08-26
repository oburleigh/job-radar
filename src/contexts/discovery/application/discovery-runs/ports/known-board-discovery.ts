export type KnownBoardSyncEvidence = {
  readonly boardId: number;
  readonly jobsWritten: number;
  readonly error: string;
};

export interface KnownBoardDiscoveryCatalog {
  readonly countEnabledBoards: () => number;
  readonly synchronizeEnabledBoards: (
    jobLimit: number,
  ) => Promise<readonly KnownBoardSyncEvidence[]>;
}
