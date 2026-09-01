import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PlaywrightTestConfig } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("browser verification build isolation", () => {
  const originalBuildDirectory = process.env.JOB_RADAR_BUILD_DIRECTORY;
  const originalBraveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment("JOB_RADAR_BUILD_DIRECTORY", originalBuildDirectory);
    restoreEnvironment("BRAVE_SEARCH_API_KEY", originalBraveSearchApiKey);
  });

  it("keeps the production build directory when no verification override is present", async () => {
    delete process.env.JOB_RADAR_BUILD_DIRECTORY;

    const configUrl = new URL("../../react-router.config.ts", import.meta.url);
    configUrl.searchParams.set("test", crypto.randomUUID());
    const { default: config } = await import(configUrl.href);

    expect(config.buildDirectory).toBe("build");
  });

  it("lets a verification process select a disposable React Router build directory", async () => {
    const buildDirectory = path.join(tmpdir(), "job-radar-browser-build-test");
    process.env.JOB_RADAR_BUILD_DIRECTORY = buildDirectory;

    const configUrl = new URL("../../react-router.config.ts", import.meta.url);
    configUrl.searchParams.set("test", crypto.randomUUID());
    const { default: config } = await import(configUrl.href);

    expect(config.buildDirectory).toBe(buildDirectory);
  });

  it("builds and serves both browser suites from their disposable directories", async () => {
    vi.spyOn(process, "once").mockReturnValue(process);
    process.env.BRAVE_SEARCH_API_KEY = "browser-build-isolation-test";

    const standardConfig = await loadPlaywrightConfig("../../playwright.config.ts");
    const realConfig = await loadPlaywrightConfig("../../playwright.recruiter-real.config.ts");
    const standardServer = Array.isArray(standardConfig.webServer)
      ? standardConfig.webServer.find((server) => server.url === "http://127.0.0.1:3100")
      : standardConfig.webServer;
    const realServer = Array.isArray(realConfig.webServer)
      ? realConfig.webServer[0]
      : realConfig.webServer;

    for (const server of [standardServer, realServer]) {
      expect(server).toBeDefined();
      const buildDirectory = server?.env?.JOB_RADAR_BUILD_DIRECTORY;
      expect(path.dirname(buildDirectory ?? "")).toBe(path.join(process.cwd(), "build"));
      expect(path.basename(buildDirectory ?? "")).toMatch(/^playwright-/);
      expect(server?.command).toContain(`${buildDirectory}${path.sep}server${path.sep}index.js`);
      expect(server?.command).not.toContain("pnpm start");
    }
  });

  it("routes every test-owned production build away from the live build directory", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const testBuildScripts = Object.entries(packageJson.scripts ?? {}).filter(
      ([name, command]) => name.startsWith("test:") && command.includes("pnpm build"),
    );

    expect(packageJson.scripts?.["build:verification"]).toBe(
      "cross-env JOB_RADAR_BUILD_DIRECTORY=build/verification pnpm build",
    );
    expect(testBuildScripts.length).toBeGreaterThan(0);
    for (const [, command] of testBuildScripts) {
      expect(command).toContain("pnpm build:verification");
      expect(command).not.toMatch(/pnpm build(?:\s|$|&&)/);
    }
  });
});

async function loadPlaywrightConfig(relativePath: string): Promise<PlaywrightTestConfig> {
  const configUrl = new URL(relativePath, import.meta.url);
  configUrl.searchParams.set("test", crypto.randomUUID());
  const { default: config } = await import(configUrl.href);
  return config;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
