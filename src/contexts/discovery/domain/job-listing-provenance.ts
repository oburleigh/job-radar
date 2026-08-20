export const JOB_LISTING_EVIDENCE = ["search-lead", "structured"] as const;

export type JobListingEvidence = (typeof JOB_LISTING_EVIDENCE)[number];
export type ListingAuthority = "primary" | "secondary";

interface ListingProvenance {
  readonly evidence: JobListingEvidence;
  readonly authority: ListingAuthority;
}

export function isVerifiedJobListing(evidence: JobListingEvidence): boolean {
  return evidence === "structured";
}

export function shouldPreferListingCandidate(
  current: ListingProvenance,
  candidate: ListingProvenance,
): boolean {
  if (current.evidence !== candidate.evidence) {
    return candidate.evidence === "structured";
  }
  return current.authority === "secondary" && candidate.authority === "primary";
}
