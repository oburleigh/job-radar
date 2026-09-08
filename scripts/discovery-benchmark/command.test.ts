import { describe, expect, it } from "vitest";
import { evaluateDiscoveryBenchmark } from "./command";
import { discoveryBenchmarkCorpus } from "./corpus";

describe("discovery benchmark command", () => {
  it("returns a successful JSON report for the credential-free corpus", async () => {
    const result = await evaluateDiscoveryBenchmark(discoveryBenchmarkCorpus);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({ passed: true }));
  }, 60_000);

  it("returns a failing exit code without hiding uncovered profiles", async () => {
    const result = await evaluateDiscoveryBenchmark({
      ...discoveryBenchmarkCorpus,
      examples: discoveryBenchmarkCorpus.examples.filter(
        (example) => example.profile !== "Asia engineering leadership",
      ),
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        passed: false,
        coverage: expect.objectContaining({ missingMarkets: [] }),
        profiles: expect.arrayContaining([
          expect.objectContaining({
            profile: "Asia engineering leadership",
            expectedPositives: 0,
            recall: 0,
            top20Precision: 0,
          }),
        ]),
      }),
    );
  });

  it("fails when a declared profile retains only negative examples", async () => {
    const result = await evaluateDiscoveryBenchmark({
      ...discoveryBenchmarkCorpus,
      examples: discoveryBenchmarkCorpus.examples.filter(
        (example) =>
          example.profile !== "UK platform/infrastructure IC" || !example.expectedVisible,
      ),
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).profiles).toContainEqual(
      expect.objectContaining({
        profile: "UK platform/infrastructure IC",
        expectedPositives: 0,
        recall: 0,
        top20Precision: 0,
      }),
    );
  });
});
