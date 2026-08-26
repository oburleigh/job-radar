export type KnownBoardSyncEvidence = {
  readonly boardId: number;
  readonly jobsWritten: number;
  readonly error: string;
};

export type KnownBoardReference = {
  readonly id: number;
  readonly name: string;
};

export interface KnownBoardDiscoveryObserver {
  readonly boardStarted: (board: KnownBoardReference) => void;
  readonly boardCompleted: (evidence: KnownBoardSyncEvidence) => Promise<void>;
}

export interface KnownBoardDiscoveryCatalog {
  readonly countEnabledBoards: () => number;
  readonly synchronizeEnabledBoards: (
    jobLimit: number,
    observer: KnownBoardDiscoveryObserver,
  ) => Promise<readonly KnownBoardSyncEvidence[]>;
}
