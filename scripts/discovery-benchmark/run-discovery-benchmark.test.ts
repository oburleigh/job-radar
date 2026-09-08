import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { discoveryBenchmarkCorpus } from "./corpus";
import { runDiscoveryBenchmark } from "./run-discovery-benchmark";

describe("deterministic discovery benchmark", { timeout: 60_000 }, () => {
  it("does not open the configured application database", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "job-radar-benchmark-import-"));
    const configuredDatabasePath = path.join(directory, "private.sqlite");
    const previousDatabasePath = process.env.DB_PATH;
    process.env.DB_PATH = configuredDatabasePath;

    try {
      await runDiscoveryBenchmark(discoveryBenchmarkCorpus);

      expect(existsSync(configuredDatabasePath)).toBe(false);
      expect(existsSync(path.resolve(process.cwd(), ":memory:"))).toBe(false);
    } finally {
      if (previousDatabasePath === undefined) {
        delete process.env.DB_PATH;
      } else {
        process.env.DB_PATH = previousDatabasePath;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records the exact Asia legacy request formula", async () => {
    const report = await runDiscoveryBenchmark(discoveryBenchmarkCorpus);

    expect(report.requestEvidence.legacyAsiaBaseline).toEqual({
      titleTerms: 12,
      sources: 15,
      variantsPerTitleSource: 2,
      boardDiscoveryRequests: 10,
      totalRequests: 370,
    });
    expect(report.requestEvidence.legacyAsiaBaseline.totalRequests).toBe(12 * 15 * 2 + 10);
  });

  it("follows every labelled role through the production discovery path", async () => {
    const report = await runDiscoveryBenchmark(discoveryBenchmarkCorpus);

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
    expect(report.observations.find((item) => item.id === "uk-ic-staff-platform-engineer")).toEqual(
      expect.objectContaining({
        retrieved: true,
        classified: true,
        verification: "verified",
        match: "matched",
        visibleRank: 1,
      }),
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
    expect(report.requestEvidence.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "Asia engineering leadership",
          totalRequests: expect.any(Number),
          completedRoleStrategies: ["role-first", "location-first", "phrase", "relaxed-title"],
        }),
      ]),
    );
    expect(
      report.requestEvidence.profiles.every(
        (profile) => profile.totalRequests <= 111 && profile.productiveLocalRoleRate >= 0.1,
      ),
    ).toBe(true);
    expect(report.requestEvidence.targetsMet).toBe(true);
    expect(report.passed).toBe(true);
  });

  it("keeps visibility ranks scoped to the profile when two labels share a URL", async () => {
    const sharedUrl = discoveryBenchmarkCorpus.examples.find(
      (example) => example.id === "uk-leadership-head-of-engineering",
    )?.url;
    expect(sharedUrl).toBeDefined();
    const report = await runDiscoveryBenchmark({
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
