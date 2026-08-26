export type DiscoveryRunOutcome = "running" | "completed" | "partial" | "failed" | "cancelled";

export type DiscoveryRunOutcomeEvidence = {
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly queryCount: number;
  readonly queryErrorCount: number;
  readonly syncErrorCount: number;
  readonly knownBoardCount: number | null;
  readonly knownBoardSuccessCount: number | null;
};

export function deriveDiscoveryRunOutcome(
  evidence: DiscoveryRunOutcomeEvidence,
): DiscoveryRunOutcome {
  if (evidence.status === "running" || evidence.status === "cancelled") {
    return evidence.status;
  }

  if (evidence.knownBoardCount === null || evidence.knownBoardSuccessCount === null) {
    if (evidence.status === "failed") {
      return "failed";
    }
    return evidence.queryErrorCount + evidence.syncErrorCount > 0 ? "partial" : "completed";
  }

  const successfulItems =
    evidence.knownBoardSuccessCount + Math.max(0, evidence.queryCount - evidence.queryErrorCount);
  const failedItems = evidence.queryErrorCount + evidence.syncErrorCount;
  if (failedItems > 0 || evidence.status === "failed") {
    return successfulItems > 0 ? "partial" : "failed";
  }
  return "completed";
}
