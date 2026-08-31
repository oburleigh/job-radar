import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

import teardownPlaywrightDatabase from "./tests/support/teardown-playwright-database";

const BASE_URL = "http://127.0.0.1:3300";
const databaseDirectory = path.join(tmpdir(), `job-radar-playwright-recruiter-real-${process.pid}`);
const databasePath = path.join(databaseDirectory, "job-radar.sqlite");
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY;

if (!braveSearchApiKey) {
  throw new Error("BRAVE_SEARCH_API_KEY is required for the real Recruiter Search browser check.");
}

process.env.JOB_RADAR_E2E_DIRECTORY = databaseDirectory;
process.once("exit", teardownPlaywrightDatabase);

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
  testMatch: "**/recruiter-search.real.spec.ts",
  timeout: 360_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm db:setup && pnpm build && pnpm start",
    env: {
      DB_PATH: databasePath,
      HOST: "127.0.0.1",
      PORT: "3300",
      BRAVE_SEARCH_API_KEY: braveSearchApiKey,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: BASE_URL,
  },
  workers: 1,
});
