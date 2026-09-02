import { readFileSync } from "node:fs";
import path from "node:path";

import type { PlaywrightTestConfig } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";

const repositoryRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("verification gate environment", () => {
  const originalBraveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalBraveSearchApiKey === undefined) {
      delete process.env.BRAVE_SEARCH_API_KEY;
    } else {
      process.env.BRAVE_SEARCH_API_KEY = originalBraveSearchApiKey;
    }
  });

  it("loads the real web-search configuration when the provider key is absent", async () => {
    vi.spyOn(process, "once").mockReturnValue(process);
    delete process.env.BRAVE_SEARCH_API_KEY;

    const config = await loadRealWebSearchConfig();

    expect(config.webServer).toBeUndefined();
    expect(config.testMatch).toBe("**/*.real.spec.ts");
  });

  it("serves the real web-search suite from its own build when the provider key is present", async () => {
    vi.spyOn(process, "once").mockReturnValue(process);
    process.env.BRAVE_SEARCH_API_KEY = "verification-gate-test";

    const config = await loadRealWebSearchConfig();
    const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;

    expect(server?.env?.BRAVE_SEARCH_API_KEY).toBe("verification-gate-test");
  });

  it("loads the documented environment file for the real web-search suite", () => {
    expect(packageJson.scripts?.["test:e2e:web-search-real"]).toContain(
      "NODE_OPTIONS=--import=dotenv/config",
    );
    expect(readFileSync(path.join(repositoryRoot, ".env.example"), "utf8")).toContain(
      "BRAVE_SEARCH_API_KEY=",
    );
  });
});

async function loadRealWebSearchConfig(): Promise<PlaywrightTestConfig> {
  const configUrl = new URL("../../playwright.web-search-real.config.ts", import.meta.url);
  configUrl.searchParams.set("test", crypto.randomUUID());
  const { default: config } = (await import(configUrl.href)) as { default: PlaywrightTestConfig };
  return config;
}
