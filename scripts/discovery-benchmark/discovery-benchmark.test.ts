import { describe, expect, it } from "vitest";

import {
  createDiscoveryBenchmarkReport as createReport,
  type DiscoveryBenchmarkObservation,
  type DiscoveryBenchmarkProfileDefinition,
} from "./discovery-benchmark";

describe("discovery corpus benchmark", () => {
  it("reports every profile and groups positive misses by the first failed stage", () => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: "uk-leadership-visible",
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: 1,
      }),
      observation({
        id: "uk-leadership-provider-miss",
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        retrieved: false,
        classified: false,
        verification: "unverified",
        match: "excluded",
        visibleRank: null,
      }),
      observation({
        id: "asia-ic-classification-miss",
        profile: "Asia platform IC",
        market: "Asia",
        track: "individual-contributor",
        expectedVisible: true,
        classified: false,
        verification: "unverified",
        match: "excluded",
        visibleRank: null,
      }),
    ]);

    expect(report.profiles).toEqual([
      expect.objectContaining({
        profile: "UK engineering leadership",
        recall: 0.5,
        top20Precision: 1,
      }),
      expect.objectContaining({
        profile: "Asia platform IC",
        recall: 0,
        top20Precision: 0,
      }),
    ]);
    expect(report.misses).toEqual({
      provider: ["uk-leadership-provider-miss"],
      classification: ["asia-ic-classification-miss"],
      verification: [],
      matching: [],
      presentation: [],
    });
    expect(report.passed).toBe(false);
  });

  it("fails when a negative example is visible in the top twenty", () => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: "uae-leadership-positive",
        profile: "UAE engineering leadership",
        market: "UAE",
        track: "leadership",
        expectedVisible: true,
        visibleRank: 1,
      }),
      observation({
        id: "uae-sales-negative",
        profile: "UAE engineering leadership",
        market: "UAE",
        track: "leadership",
        expectedVisible: false,
        visibleRank: 2,
      }),
    ]);

    expect(report.profiles[0]).toEqual(expect.objectContaining({ recall: 1, top20Precision: 0.5 }));
    expect(report.negativeAdmissions).toEqual(["uae-sales-negative"]);
    expect(report.passed).toBe(false);
  });

  it("fails at the earliest broken stage even when synthetic later stages remain visible", () => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: "uk-classification-regression",
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        classified: false,
        visibleRank: 1,
      }),
    ]);

    expect(report.misses.classification).toEqual(["uk-classification-regression"]);
    expect(report.passed).toBe(false);
  });

  it.each([
    ["verification", { verification: "unverified", match: "excluded", visibleRank: null }],
    ["matching", { match: "excluded", visibleRank: null }],
    ["presentation", { visibleRank: null }],
  ] as const)("groups a positive role stopped at %s", (stage, stopped) => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: `${stage}-miss`,
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        ...stopped,
      }),
    ]);

    expect(report.misses[stage]).toEqual([`${stage}-miss`]);
  });

  it("includes rank twenty but excludes rank twenty-one from precision", () => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: "positive-at-twenty",
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: 20,
      }),
      observation({
        id: "negative-at-twenty-one",
        profile: "UK engineering leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: false,
        visibleRank: 21,
      }),
    ]);

    expect(report.profiles[0]).toEqual(
      expect.objectContaining({
        top20Results: 1,
        relevantTop20Results: 1,
        top20Precision: 1,
      }),
    );
    expect(report.negativeAdmissions).toEqual(["negative-at-twenty-one"]);
  });

  it("exposes the product targets and profile market classification", () => {
    const report = createDiscoveryBenchmarkReport(completeCoverageObservations());

    expect(report.targets).toEqual({ recall: 0.9, top20Precision: 0.8 });
    expect(report.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profile: "UK leadership", market: "UK", track: "leadership" }),
        expect.objectContaining({
          profile: "UAE IC",
          market: "UAE",
          track: "individual-contributor",
        }),
      ]),
    );
    expect(report.passed).toBe(true);
  });

  it("treats the exact recall and precision thresholds as meeting target", () => {
    const recallBoundary = Array.from({ length: 10 }, (_, index) =>
      observation({
        id: `recall-${index}`,
        profile: "Recall boundary",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: index < 9 ? index + 1 : null,
      }),
    );
    const precisionBoundary = [
      ...Array.from({ length: 4 }, (_, index) =>
        observation({
          id: `precision-positive-${index}`,
          profile: "Precision boundary",
          market: "UAE",
          track: "individual-contributor",
          expectedVisible: true,
          visibleRank: index + 1,
        }),
      ),
      observation({
        id: "precision-negative",
        profile: "Precision boundary",
        market: "UAE",
        track: "individual-contributor",
        expectedVisible: false,
        visibleRank: 5,
      }),
    ];
    const observations = [...recallBoundary, ...precisionBoundary];
    const report = createReport(profileDefinitionsFor(observations), observations);

    expect(report.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "Recall boundary",
          recall: 0.9,
          top20Precision: 1,
          targetsMet: true,
        }),
        expect.objectContaining({
          profile: "Precision boundary",
          recall: 1,
          top20Precision: 0.8,
          targetsMet: true,
        }),
      ]),
    );
  });

  it("requires both recall and precision targets for every profile", () => {
    const observations = [
      observation({
        id: "low-recall-visible",
        profile: "Low recall",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: 1,
      }),
      observation({
        id: "low-recall-missed",
        profile: "Low recall",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: null,
      }),
      observation({
        id: "low-precision-positive",
        profile: "Low precision",
        market: "UAE",
        track: "individual-contributor",
        expectedVisible: true,
        visibleRank: 1,
      }),
      observation({
        id: "low-precision-negative",
        profile: "Low precision",
        market: "UAE",
        track: "individual-contributor",
        expectedVisible: false,
        visibleRank: 2,
      }),
    ];
    const report = createReport(profileDefinitionsFor(observations), observations);

    expect(report.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "Low recall",
          recall: 0.5,
          top20Precision: 1,
          targetsMet: false,
        }),
        expect.objectContaining({
          profile: "Low precision",
          recall: 1,
          top20Precision: 0.5,
          targetsMet: false,
        }),
      ]),
    );
  });

  it("fails when one required market is absent but both tracks remain covered", () => {
    const observations = completeCoverageObservations().filter((item) => item.market !== "Asia");
    const report = createDiscoveryBenchmarkReport(observations);

    expect(report.coverage).toEqual(
      expect.objectContaining({ missingMarkets: ["Asia"], missingTracks: [] }),
    );
    expect(report.passed).toBe(false);
  });

  it("keeps a declared profile visible and failing when all of its examples disappear", () => {
    const observations = completeCoverageObservations().filter((item) => item.profile !== "UAE IC");
    const report = createReport(completeCoverageProfiles(), observations);

    expect(report.coverage.missingMarkets).toEqual([]);
    expect(report.profiles).toContainEqual(
      expect.objectContaining({
        profile: "UAE IC",
        expectedPositives: 0,
        recall: 0,
        top20Precision: 0,
      }),
    );
    expect(report.passed).toBe(false);
  });

  it("fails a complete corpus when one positive stage regresses", () => {
    const observations = completeCoverageObservations();
    const firstObservation = observations[0] as DiscoveryBenchmarkObservation;
    const report = createDiscoveryBenchmarkReport([
      { ...firstObservation, classified: false },
      ...observations.slice(1),
    ]);

    expect(report.coverage.missingMarkets).toEqual([]);
    expect(report.misses.classification).toEqual(["uk-positive"]);
    expect(report.passed).toBe(false);
  });

  it("fails a complete corpus when a negative example is admitted", () => {
    const report = createDiscoveryBenchmarkReport([
      ...completeCoverageObservations(),
      observation({
        id: "asia-negative",
        profile: "Asia leadership",
        market: "Asia",
        track: "leadership",
        expectedVisible: false,
        visibleRank: 2,
      }),
    ]);

    expect(report.negativeAdmissions).toEqual(["asia-negative"]);
    expect(report.passed).toBe(false);
  });

  it("fails when all markets are present but an employment track is absent", () => {
    const report = createDiscoveryBenchmarkReport(
      completeCoverageObservations().map((item) => ({ ...item, track: "leadership" as const })),
    );

    expect(report.coverage).toEqual(
      expect.objectContaining({ missingMarkets: [], missingTracks: ["individual-contributor"] }),
    );
    expect(report.passed).toBe(false);
  });

  it("requires UK, UAE, and Asia coverage across leadership and individual contributors", () => {
    const report = createDiscoveryBenchmarkReport([
      observation({
        id: "uk-leadership",
        profile: "UK leadership",
        market: "UK",
        track: "leadership",
        expectedVisible: true,
        visibleRank: 1,
      }),
    ]);

    expect(report.coverage).toEqual({
      markets: ["UK"],
      tracks: ["leadership"],
      missingMarkets: ["UAE", "Asia"],
      missingTracks: ["individual-contributor"],
    });
    expect(report.passed).toBe(false);
  });
});

function observation(
  overrides: Partial<DiscoveryBenchmarkObservation> &
    Pick<DiscoveryBenchmarkObservation, "id" | "profile" | "market" | "track" | "expectedVisible">,
): DiscoveryBenchmarkObservation {
  return {
    source: "greenhouse",
    expectedVerification: "verified",
    expectedMatch: overrides.expectedVisible ? "matched" : "excluded",
    retrieved: true,
    classified: true,
    verification: "verified",
    match: overrides.expectedVisible ? "matched" : "excluded",
    visibleRank: null,
    ...overrides,
  };
}

function createDiscoveryBenchmarkReport(observations: DiscoveryBenchmarkObservation[]) {
  return createReport(profileDefinitionsFor(observations), observations);
}

function profileDefinitionsFor(
  observations: readonly DiscoveryBenchmarkObservation[],
): DiscoveryBenchmarkProfileDefinition[] {
  return [
    ...new Map(
      observations.map((item) => [
        item.profile,
        { name: item.profile, market: item.market, track: item.track },
      ]),
    ).values(),
  ];
}

function completeCoverageObservations(): DiscoveryBenchmarkObservation[] {
  return [
    observation({
      id: "uk-positive",
      profile: "UK leadership",
      market: "UK",
      track: "leadership",
      expectedVisible: true,
      visibleRank: 1,
    }),
    observation({
      id: "uae-positive",
      profile: "UAE IC",
      market: "UAE",
      track: "individual-contributor",
      expectedVisible: true,
      visibleRank: 1,
    }),
    observation({
      id: "asia-positive",
      profile: "Asia leadership",
      market: "Asia",
      track: "leadership",
      expectedVisible: true,
      visibleRank: 1,
    }),
  ];
}

function completeCoverageProfiles(): DiscoveryBenchmarkProfileDefinition[] {
  return profileDefinitionsFor(completeCoverageObservations());
}
