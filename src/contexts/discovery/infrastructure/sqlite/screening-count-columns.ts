import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";

export function screeningCountColumns(reasons: readonly ExclusionReason[]) {
  const count = (...codes: ReadonlyArray<ExclusionReason["code"]>) =>
    reasons.filter((reason) => codes.includes(reason.code)).length;

  return {
    excludedTitleReasonCount: count("title-mismatch", "excluded-title"),
    excludedLocationReasonCount: count("location-mismatch", "excluded-location"),
    staleReasonCount: count("stale-listing"),
    unverifiedReasonCount: count("unverified-lead"),
    contextReasonCount: count("missing-required-job-term"),
    salaryReasonCount: count("salary-above", "salary-below"),
  };
}
