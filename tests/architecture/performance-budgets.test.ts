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
const gitignore = readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8");
const performanceGuide = readFileSync(path.join(repositoryRoot, "PERFORMANCE.md"), "utf8");
const lighthouseServer = readFileSync(
  path.join(repositoryRoot, "tests", "support", "lighthouse-server.ts"),
  "utf8",
);
const { default: lighthouseConfig } = await import(path.join(repositoryRoot, "lighthouserc.cjs"));

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

  it("pins Lighthouse CI and exposes repeatable local commands", () => {
    expect(packageJson.devDependencies?.["@lhci/cli"]).toBe("0.15.1");
    expect(packageJson.scripts?.["serve:lighthouse"]).toBe(
      "pnpm exec tsx tests/support/lighthouse-server.ts",
    );
    expect(packageJson.scripts?.["performance:lighthouse"]).toBe("lhci autorun");
    expect(packageJson.scripts?.["test:performance:lighthouse"]).toBe(
      "pnpm build && pnpm performance:lighthouse",
    );
  });

  it("collects the production root with a fresh fixture and keeps Lighthouse reports private", () => {
    const collect = lighthouseConfig.ci.collect;
    const assertions = lighthouseConfig.ci.assert.assertions;

    expect(collect.url).toEqual(["http://127.0.0.1:3300/"]);
    expect(collect.startServerCommand).toBe("pnpm serve:lighthouse");
    expect(collect.numberOfRuns).toBe(3);
    expect(collect.settings.preset).toBe("desktop");
    expect(collect.settings.chromeFlags).toEqual(["--no-sandbox", "--disable-dev-shm-usage"]);
    expect(collect.chromePath).toBe(process.env.CHROME_PATH || undefined);
    expect(assertions["categories:performance"]).toEqual([
      "error",
      { minScore: 0.9, aggregationMethod: "median" },
    ]);
    expect(lighthouseConfig.ci.upload).toEqual({
      target: "filesystem",
      outputDir: "artifacts/lighthouse",
    });
    expect(JSON.stringify(lighthouseConfig)).not.toContain("temporary-public-storage");

    expect(lighthouseServer).toContain("mkdtempSync");
    expect(lighthouseServer).toContain("job-radar-lighthouse-");
    expect(lighthouseServer).toContain("job-radar.sqlite");
    expect(lighthouseServer).toContain('"db:setup"');
    expect(lighthouseServer).toContain('"start"');
    expect(lighthouseServer).toContain('PORT: "3300"');
    expect(lighthouseServer).toContain('SERPER_API_KEY: "lighthouse-fixture-key"');
  });

  it("runs Lighthouse in CI after the client build and retains its diagnostic artifact", () => {
    const lighthouseCommand = ciWorkflow.indexOf("pnpm performance:lighthouse");
    const sizeCommand = ciWorkflow.indexOf("pnpm performance:size");

    expect(lighthouseCommand).toBeGreaterThan(sizeCommand);
    expect(ciWorkflow).toContain("CHROME_PATH: /usr/bin/google-chrome");
    expect(ciWorkflow).toMatch(/if:\s*always\(\)/);
    expect(ciWorkflow).toContain("actions/upload-artifact@v7.0.1");
    expect(ciWorkflow).toContain("artifacts/lighthouse");
    expect(gitignore).toContain("/.lighthouseci/");
    expect(gitignore).toContain("/artifacts/lighthouse/");
  });

  it("documents the Lighthouse fixture, aggregation, threshold, artifacts, and deferred timings", () => {
    expect(performanceGuide).toContain("127.0.0.1:3300");
    expect(performanceGuide).toMatch(/fresh[\s\S]*fixture|fixture[\s\S]*fresh/i);
    expect(performanceGuide).toMatch(/three|3/);
    expect(performanceGuide).toMatch(/median/i);
    expect(performanceGuide).toContain("0.90");
    expect(performanceGuide).toMatch(/headroom/i);
    expect(performanceGuide).toContain("artifacts/lighthouse");
    expect(performanceGuide).toContain("pnpm test:performance:lighthouse");
    expect(performanceGuide).toMatch(/absolute\s+timing/i);
  });
});
