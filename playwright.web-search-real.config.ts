import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

import teardownPlaywrightArtifacts from "./tests/support/teardown-playwright-artifacts";

const BASE_URL = "http://127.0.0.1:3300";
const databaseDirectory = path.join(
  tmpdir(),
  `job-radar-playwright-web-search-real-${process.pid}`,
);
const databasePath = path.join(databaseDirectory, "job-radar.sqlite");
const buildDirectory = path.join(process.cwd(), "build", `playwright-real-${process.pid}`);
const serverBuildPath = path.join(buildDirectory, "server", "index.js");
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY;

if (!braveSearchApiKey) {
  throw new Error("BRAVE_SEARCH_API_KEY is required for the real web-search browser checks.");
}

process.env.JOB_RADAR_E2E_DIRECTORY = databaseDirectory;
process.env.JOB_RADAR_E2E_BUILD_DIRECTORY = buildDirectory;
process.once("exit", teardownPlaywrightArtifacts);

export default defineConfig({
  expect: { timeout: 300_000 },
  forbidOnly: true,
  fullyParallel: false,
  projects: [
    {
      name: "real-public-search",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" } : {}),
      },
    },
  ],
  reporter: "list",
  retries: 0,
  testDir: "e2e",
  testMatch: "**/*.real.spec.ts",
  timeout: 360_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm db:setup && pnpm build && pnpm exec react-router-serve ${serverBuildPath}`,
    env: {
      DB_PATH: databasePath,
      HOST: "127.0.0.1",
      JOB_RADAR_BUILD_DIRECTORY: buildDirectory,
      JOB_RADAR_RECRUITER_RESEARCH_SOURCE: "public-web",
      PORT: "3300",
      BRAVE_SEARCH_API_KEY: braveSearchApiKey,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: BASE_URL,
  },
  workers: 1,
});
