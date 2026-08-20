export interface SourceCoverageStore {
  setSourceEnabled(sourceId: number, enabled: boolean): void;
  setBoardEnabled(boardId: number, enabled: boolean): void;
}
