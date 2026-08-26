export type SearchLaneStopReason =
  | "no-more-results"
  | "insufficient-useful-hits"
  | "max-pages-per-lane"
  | "max-requests-per-run";

type ContinuationEvidence = {
  readonly hasMore: boolean;
  readonly usefulHitCount: number;
  readonly minimumUsefulHitsPerPage: number;
  readonly page: number;
  readonly maxPagesPerLane: number;
  readonly admittedRequestCount: number;
  readonly maxRequestsPerRun: number;
};

export type SearchLaneContinuation =
  | { readonly continue: true; readonly stopReason: null }
  | { readonly continue: false; readonly stopReason: SearchLaneStopReason };

export function decideSearchLaneContinuation(
  evidence: ContinuationEvidence,
): SearchLaneContinuation {
  if (!evidence.hasMore) {
    return { continue: false, stopReason: "no-more-results" };
  }
  if (evidence.usefulHitCount < evidence.minimumUsefulHitsPerPage) {
    return { continue: false, stopReason: "insufficient-useful-hits" };
  }
  if (evidence.page >= evidence.maxPagesPerLane) {
    return { continue: false, stopReason: "max-pages-per-lane" };
  }
  if (evidence.admittedRequestCount >= evidence.maxRequestsPerRun) {
    return { continue: false, stopReason: "max-requests-per-run" };
  }
  return { continue: true, stopReason: null };
}
