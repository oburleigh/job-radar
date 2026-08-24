import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  "size-limit"?: Array<{
    limit: string;
    name: string;
    path: string;
  }>;
};
const ciWorkflow = readFileSync(
  path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
  "utf8",
);
const performanceGuide = readFileSync(path.join(repositoryRoot, "PERFORMANCE.md"), "utf8");

describe("production client asset budgets", () => {
  it("pins Size Limit and defines the JavaScript and CSS production asset budgets", () => {
    expect(packageJson.devDependencies?.["size-limit"]).toBe("13.0.3");
    expect(packageJson.devDependencies?.["@size-limit/file"]).toBe("13.0.3");
    expect(packageJson["size-limit"]).toEqual([
      {
        name: "all production JavaScript",
        path: "build/client/assets/*.js",
        limit: "130 kB",
      },
      {
        name: "production CSS",
        path: "build/client/assets/*.css",
        limit: "11 kB",
      },
    ]);
  });

  it("exposes a local build-and-budget check and runs its budget phase in CI after the build", () => {
    expect(packageJson.scripts?.["performance:size"]).toBe("size-limit");
    expect(packageJson.scripts?.["test:performance:size"]).toBe(
      "pnpm build && pnpm performance:size",
    );
    expect(ciWorkflow).toContain("pnpm performance:size");
    expect(ciWorkflow.indexOf("pnpm performance:size")).toBeGreaterThan(
      ciWorkflow.indexOf("pnpm build"),
    );
  });

  it("documents the measured surface, fixture, thresholds, aggregation, and headroom rationale", () => {
    expect(performanceGuide).toContain("build/client/assets/*.js");
    expect(performanceGuide).toContain("build/client/assets/*.css");
    expect(performanceGuide).toContain("23 files");
    expect(performanceGuide).toContain("390,540 raw bytes");
    expect(performanceGuide).toContain("109,711 Brotli");
    expect(performanceGuide).toContain("130 kB");
    expect(performanceGuide).toContain("11 kB");
    expect(performanceGuide).toMatch(/fixture|environment/i);
    expect(performanceGuide).toMatch(/aggregate|aggregation/i);
    expect(performanceGuide).toMatch(/headroom/i);
  });
});
