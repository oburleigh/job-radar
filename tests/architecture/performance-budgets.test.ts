import { existsSync, readFileSync } from "node:fs";
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
const performanceServer = readFileSync(
  path.join(repositoryRoot, "tests", "support", "production-performance-server.ts"),
  "utf8",
);
const performanceSeeder = readFileSync(
  path.join(repositoryRoot, "tests", "support", "seed-performance-database.ts"),
  "utf8",
);
const browserPerformanceConfig = readFileSync(
  path.join(repositoryRoot, "playwright.performance.config.ts"),
  "utf8",
);
const browserPerformanceSpec = readFileSync(
  path.join(repositoryRoot, "performance", "browser-budget.spec.ts"),
  "utf8",
);
const latencyMeasurement = readFileSync(
  path.join(repositoryRoot, "scripts", "measure-performance-latency.ts"),
  "utf8",
);
const scheduledWorkflowPath = path.join(repositoryRoot, ".github", "workflows", "performance.yml");
const scheduledWorkflow = existsSync(scheduledWorkflowPath)
  ? readFileSync(scheduledWorkflowPath, "utf8")
  : "";
const { default: lighthouseConfig } = await import(path.join(repositoryRoot, "lighthouserc.cjs"));

describe("production client asset budgets", () => {
  it("pins Size Limit and defines the JavaScript and CSS production asset budgets", () => {
    expect(packageJson.devDependencies?.["size-limit"]).toBe("13.0.3");
    expect(packageJson.devDependencies?.["@size-limit/file"]).toBe("13.0.3");
    expect(packageJson["size-limit"]).toEqual([
      {
        name: "all production JavaScript",
        path: "build/client/assets/*.js",
        limit: "165 kB",
      },
      {
        name: "production CSS",
        path: "build/client/assets/*.css",
        limit: "14 kB",
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
    expect(performanceGuide).toContain("27 files");
    expect(performanceGuide).toContain("509,726 raw bytes");
    expect(performanceGuide).toContain("140,335 Brotli");
    expect(performanceGuide).toContain("74,772 raw bytes");
    expect(performanceGuide).toContain("11,146 Brotli");
    expect(performanceGuide).toContain("165 kB");
    expect(performanceGuide).toContain("14 kB");
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

    expect(lighthouseServer).toContain("startProductionPerformanceServer");
    expect(performanceServer).toContain("mkdtempSync");
    expect(performanceServer).toContain("job-radar-performance-");
    expect(performanceServer).toContain("job-radar.sqlite");
    expect(performanceServer).toContain('"db:setup"');
    expect(performanceServer).toContain('"start"');
    expect(performanceServer).toContain("String(port)");
    expect(performanceServer).toContain('SERPER_API_KEY: "performance-fixture-key"');
    expect(performanceSeeder).toContain('name: "Performance fixture"');
    expect(performanceSeeder).toContain("title: `Staff Platform Engineer $" + "{suffix}`");
    expect(performanceSeeder).toContain("index <= 20");
  });

  it("runs Lighthouse in CI after the client build and retains its diagnostic artifact", () => {
    const lighthouseCommand = ciWorkflow.indexOf("pnpm performance:lighthouse");
    const sizeCommand = ciWorkflow.indexOf("pnpm performance:size");

    expect(lighthouseCommand).toBeGreaterThan(sizeCommand);
    expect(ciWorkflow).toContain("CHROME_PATH: /usr/bin/google-chrome");
    expect(ciWorkflow).toMatch(/if:\s*always\(\)/);
    expect(ciWorkflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    );
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

describe("browser interaction and Web Vitals budgets", () => {
  it("pins the browser metric implementation and exposes normal and failure-probe commands", () => {
    expect(packageJson.devDependencies?.["web-vitals"]).toBe("6.1.1");
    expect(packageJson.scripts?.["performance:browser"]).toBe(
      "playwright test --config playwright.performance.config.ts",
    );
    expect(packageJson.scripts?.["test:performance:browser"]).toBe(
      "pnpm build && pnpm performance:browser",
    );
    expect(packageJson.scripts?.["probe:performance:browser"]).toContain(
      "JOB_RADAR_PERFORMANCE_PROBE=slow-interaction",
    );
  });

  it("measures a real fixture journey three times against named good-vitals thresholds", () => {
    expect(browserPerformanceConfig).toContain('testDir: "performance"');
    expect(browserPerformanceConfig).toContain('command: "pnpm serve:lighthouse"');
    expect(browserPerformanceSpec).toContain("run < 3");
    expect(browserPerformanceSpec).toContain("CLS: 0.1");
    expect(browserPerformanceSpec).toContain("INP: 200");
    expect(browserPerformanceSpec).toContain("LCP: 2_500");
    expect(browserPerformanceSpec).toContain("Staff Platform Engineer 01");
    expect(browserPerformanceSpec).toContain("web-vitals.attribution.iife.js");
    expect(browserPerformanceSpec).toContain("artifacts/browser-performance/report.json");
  });

  it("runs the browser budget in CI and retains its diagnostics even on failure", () => {
    expect(ciWorkflow).toContain("pnpm performance:browser");
    expect(ciWorkflow).toContain("artifacts/browser-performance");
    expect(ciWorkflow.indexOf("pnpm performance:browser")).toBeGreaterThan(
      ciWorkflow.indexOf("pnpm performance:lighthouse"),
    );
    expect(gitignore).toContain("/artifacts/browser-performance/");
  });
});

describe("server and SQLite latency evidence", () => {
  it("pins Autocannon and records repeatable production HTTP and dashboard-read measurements", () => {
    expect(packageJson.devDependencies?.autocannon).toBe("8.0.0");
    expect(packageJson.scripts?.["performance:latency"]).toBe(
      "tsx scripts/measure-performance-latency.ts",
    );
    expect(latencyMeasurement).toContain("--amount");
    expect(latencyMeasurement).toContain("requestCount = 500");
    expect(latencyMeasurement).toContain("connections = 10");
    expect(latencyMeasurement).toContain("getDashboardData");
    expect(latencyMeasurement).toContain("sqliteRuns = 100");
    expect(latencyMeasurement).toContain("artifacts/latency/report.json");
    expect(gitignore).toContain("/artifacts/latency/");
  });

  it("writes the latency artifact before rejecting an operationally invalid run", () => {
    expect(latencyMeasurement.indexOf("await writeFile(reportPath")).toBeGreaterThan(0);
    expect(latencyMeasurement.indexOf("HTTP latency run was invalid")).toBeGreaterThan(
      latencyMeasurement.indexOf("await writeFile(reportPath"),
    );
  });

  it("runs latency evidence on a schedule and uploads the private report", () => {
    expect(scheduledWorkflow).toContain("schedule:");
    expect(scheduledWorkflow).toContain("workflow_dispatch:");
    expect(scheduledWorkflow).toContain("pnpm performance:latency");
    expect(scheduledWorkflow).toContain("artifacts/latency");
    expect(scheduledWorkflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    );
  });
});

describe("complete maintainer performance command", () => {
  it("builds once and runs every performance surface through one local command", () => {
    expect(packageJson.scripts?.["performance:all"]).toBe(
      "pnpm performance:size && pnpm performance:lighthouse && pnpm performance:browser && pnpm performance:latency",
    );
    expect(packageJson.scripts?.["test:performance"]).toBe("pnpm build && pnpm performance:all");
    expect(performanceGuide).toContain("pnpm test:performance");
  });
});
