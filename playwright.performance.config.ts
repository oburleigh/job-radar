import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";

export default defineConfig({
  testDir: "performance",
  outputDir: "artifacts/browser-performance/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3300",
    trace: "retain-on-failure",
    ...(useSystemChrome ? { channel: "chrome" } : {}),
  },
  webServer: {
    command: "pnpm serve:lighthouse",
    env: {
      JOB_RADAR_BUILD_DIRECTORY: process.env.JOB_RADAR_BUILD_DIRECTORY ?? "build",
      JOB_RADAR_PERFORMANCE_FIXTURE: "workspace-scale",
    },
    url: "http://127.0.0.1:3300/profiles?new=1",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
