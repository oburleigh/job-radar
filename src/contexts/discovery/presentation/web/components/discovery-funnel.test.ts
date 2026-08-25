import { describe, expect, it } from "vitest";
import { type DiscoveryFunnelCounts, describeZeroMatchOutcome } from "./discovery-funnel";

describe("zero-match discovery explanation", () => {
  it("distinguishes a genuine no-hit run", () => {
    expect(describeZeroMatchOutcome(funnel(), 7)).toEqual({
      heading: "The provider returned no results",
      detail: "No candidates entered this run, so there was nothing to classify or match.",
      action: { href: "#query-details", label: "Review query details" },
    });
  });

  it("points to source coverage when returned results could not be classified", () => {
    expect(describeZeroMatchOutcome(funnel({ providerHits: 3 }), 7)).toEqual({
      heading: "Returned results did not match a supported source",
      detail: "The provider returned 3 results, but none could enter structured verification.",
      action: { href: "/sources", label: "Review source coverage" },
    });
  });

  it("explains verification as the dominant exclusion", () => {
    expect(
      describeZeroMatchOutcome(
        funnel({ providerHits: 4, classifiedCandidates: 4, verificationOnlyCandidates: 3 }),
        7,
      ),
    ).toEqual({
      heading: "Verification was the main reason no jobs matched",
      detail: "3 candidates met no other rejection rule but lacked a structured listing.",
      action: { href: "/profiles?profile=7", label: "Review verification policy" },
    });
  });

  it("explains freshness as the dominant exclusion", () => {
    expect(
      describeZeroMatchOutcome(
        funnel({
          providerHits: 4,
          classifiedCandidates: 4,
          verifiedJobs: 4,
          staleOnlyCandidates: 3,
          otherExclusions: 1,
        }),
        7,
      ),
    ).toEqual({
      heading: "Listing age was the main reason no jobs matched",
      detail:
        "3 verified candidates met no other rejection rule but were too old for this profile.",
      action: { href: "/profiles?profile=7", label: "Review maximum listing age" },
    });
  });

  it("explains the remaining profile rules when they dominate", () => {
    expect(
      describeZeroMatchOutcome(
        funnel({
          providerHits: 4,
          classifiedCandidates: 4,
          verifiedJobs: 4,
          staleOnlyCandidates: 1,
          otherExclusions: 3,
        }),
        7,
      ),
    ).toEqual({
      heading: "Profile rules were the main reason no jobs matched",
      detail:
        "3 candidates were excluded by title, location, salary, score, or another profile rule.",
      action: { href: "/profiles?profile=7", label: "Review profile rules" },
    });
  });

  it("uses singular wording for one stale or other exclusion", () => {
    expect(
      describeZeroMatchOutcome(
        funnel({
          providerHits: 1,
          classifiedCandidates: 1,
          verifiedJobs: 1,
          staleOnlyCandidates: 1,
        }),
        7,
      ).detail,
    ).toBe("1 verified candidate met no other rejection rule but was too old for this profile.");
    expect(
      describeZeroMatchOutcome(
        funnel({
          providerHits: 1,
          classifiedCandidates: 1,
          verifiedJobs: 1,
          otherExclusions: 1,
        }),
        7,
      ).detail,
    ).toBe("1 candidate was excluded by title, location, salary, score, or another profile rule.");
  });

  it("offers a trace when classified candidates have no recorded decision", () => {
    expect(
      describeZeroMatchOutcome(funnel({ providerHits: 1, classifiedCandidates: 1 }), 7),
    ).toEqual({
      heading: "Classified results did not reach a final match",
      detail: "Open a known role check to trace where a returned candidate stopped.",
      action: { href: "#known-role-check", label: "Explain a returned role" },
    });
  });
});

function funnel(overrides: Partial<DiscoveryFunnelCounts> = {}): DiscoveryFunnelCounts {
  return {
    providerHits: 0,
    classifiedCandidates: 0,
    verifiedJobs: 0,
    verificationOnlyCandidates: 0,
    staleOnlyCandidates: 0,
    otherExclusions: 0,
    finalMatches: 0,
    ...overrides,
  };
}
