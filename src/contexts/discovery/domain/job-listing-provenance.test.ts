import { describe, expect, it } from "vitest";

import { isVerifiedJobListing, shouldPreferListingCandidate } from "./job-listing-provenance";

describe("job listing provenance", () => {
  it("verifies structured listings but not search leads", () => {
    expect(isVerifiedJobListing("structured")).toBe(true);
    expect(isVerifiedJobListing("search-lead")).toBe(false);
  });

  it("prefers structured evidence, then the primary publisher", () => {
    expect(
      shouldPreferListingCandidate(
        { evidence: "search-lead", authority: "primary" },
        { evidence: "structured", authority: "secondary" },
      ),
    ).toBe(true);
    expect(
      shouldPreferListingCandidate(
        { evidence: "structured", authority: "secondary" },
        { evidence: "structured", authority: "primary" },
      ),
    ).toBe(true);
    expect(
      shouldPreferListingCandidate(
        { evidence: "structured", authority: "primary" },
        { evidence: "structured", authority: "secondary" },
      ),
    ).toBe(false);
  });

  it("does not replace a listing with equivalent or weaker provenance", () => {
    expect(
      shouldPreferListingCandidate(
        { evidence: "structured", authority: "primary" },
        { evidence: "structured", authority: "primary" },
      ),
    ).toBe(false);
    expect(
      shouldPreferListingCandidate(
        { evidence: "structured", authority: "secondary" },
        { evidence: "search-lead", authority: "primary" },
      ),
    ).toBe(false);
    expect(
      shouldPreferListingCandidate(
        { evidence: "search-lead", authority: "primary" },
        { evidence: "search-lead", authority: "secondary" },
      ),
    ).toBe(false);
  });

  it("prefers a primary publisher when evidence strength is equal", () => {
    expect(
      shouldPreferListingCandidate(
        { evidence: "search-lead", authority: "secondary" },
        { evidence: "search-lead", authority: "primary" },
      ),
    ).toBe(true);
  });
});
