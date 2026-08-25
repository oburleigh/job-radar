import { describe, expect, it } from "vitest";

import { discoveryBenchmarkCorpus } from "./corpus";
import { runDiscoveryBenchmark } from "./run-discovery-benchmark";

describe("deterministic discovery benchmark", () => {
  it("follows every labelled role through production discovery decisions", () => {
    const report = runDiscoveryBenchmark(discoveryBenchmarkCorpus);

    expect(report.coverage).toEqual({
      markets: ["UK", "UAE", "Asia"],
      tracks: ["individual-contributor", "leadership"],
      missingMarkets: [],
      missingTracks: [],
    });
    expect(report.profiles.map((profile) => profile.profile)).toEqual([
      "UK engineering leadership",
      "UAE engineering leadership",
      "Asia engineering leadership",
      "UK platform/infrastructure IC",
      "UAE platform/infrastructure IC",
    ]);
    expect(report.observations).toHaveLength(12);
    expect(report.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "uk-leadership-head-of-engineering",
          source: "greenhouse",
          expectedVerification: "verified",
          expectedMatch: "matched",
          expectedVisible: true,
          retrieved: true,
          classified: true,
          verification: "verified",
          match: "matched",
          visibleRank: 1,
        }),
        expect.objectContaining({
          id: "uae-ic-graduate-negative",
          source: "lever",
          expectedVerification: "verified",
          expectedMatch: "excluded",
          expectedVisible: false,
          retrieved: true,
          classified: true,
          verification: "verified",
          match: "excluded",
          visibleRank: null,
        }),
        expect.objectContaining({
          id: "uk-ic-unverified-negative",
          expectedVerification: "unverified",
          expectedMatch: "excluded",
          verification: "unverified",
          match: "excluded",
          visibleRank: null,
        }),
        expect.objectContaining({
          id: "asia-leadership-inactive-negative",
          expectedVerification: "inactive",
          expectedMatch: "not-evaluated",
          verification: "inactive",
          match: "not-evaluated",
          visibleRank: null,
        }),
      ]),
    );
    expect(report.misses).toEqual({
      provider: [],
      classification: [],
      verification: [],
      matching: [],
      presentation: [],
    });
    expect(report.negativeAdmissions).toEqual([]);
    expect(report.profiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ recall: 1, top20Precision: 1 })]),
    );
    expect(report.passed).toBe(true);
  });

  it("keeps visibility ranks scoped to the profile when two labels share a URL", () => {
    const sharedUrl = discoveryBenchmarkCorpus.examples.find(
      (example) => example.id === "uk-leadership-head-of-engineering",
    )?.url;
    expect(sharedUrl).toBeDefined();
    const report = runDiscoveryBenchmark({
      ...discoveryBenchmarkCorpus,
      examples: discoveryBenchmarkCorpus.examples.map((example) =>
        example.id === "uae-leadership-sales-negative"
          ? { ...example, url: sharedUrl as string }
          : example,
      ),
    });

    expect(report.observations.find((item) => item.id === "uae-leadership-sales-negative")).toEqual(
      expect.objectContaining({ visibleRank: null }),
    );
  });
});
