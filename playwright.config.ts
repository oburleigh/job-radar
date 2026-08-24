import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3100";
const FIXTURE_URL = "http://127.0.0.1:3200";
const isCi = process.env.CI !== undefined;
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const databaseDirectory = path.join(tmpdir(), `job-radar-playwright-${process.pid}`);
const databasePath = path.join(databaseDirectory, "job-radar.sqlite");
process.env.JOB_RADAR_E2E_DIRECTORY = databaseDirectory;

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./tests/support/teardown-playwright-database.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" } : {}),
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/support/playwright-discovery-fixture-server.ts",
      url: `${FIXTURE_URL}/health`,
      reuseExistingServer: false,
    },
    {
      command: "pnpm db:setup && pnpm build && pnpm start",
      env: {
        DB_PATH: databasePath,
        HOST: "127.0.0.1",
        PORT: "3100",
        SERPER_API_KEY: "playwright-fixture-key",
      },
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
