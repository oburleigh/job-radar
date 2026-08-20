export interface JobMatchEvaluator {
  readonly evaluate: (
    profileId: number,
    onBatch: () => void,
  ) => Promise<{ readonly matched: number }>;
}
