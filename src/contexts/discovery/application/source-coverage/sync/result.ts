export interface SyncSourceCoverageResult {
  readonly status: "completed";
  readonly boardCount: number;
  readonly writeCount: number;
  readonly failureCount: number;
}
