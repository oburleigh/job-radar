export interface JobMatchEvaluator {
  readonly evaluate: (
    profileId: number,
    onBatch: () => void,
    beforeBatch?: () => void,
  ) => Promise<{ readonly matched: number }>;
}
