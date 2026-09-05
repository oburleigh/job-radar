import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const port = "3402";
const baseURL = `http://127.0.0.1:${port}`;
const channel = useSystemChrome ? { channel: "chrome" as const } : {};

export default defineConfig({
  testDir: "audit",
  outputDir: "artifacts/audit/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, ...channel },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, ...channel },
    },
  ],
  webServer: {
    command: "pnpm serve:lighthouse",
    env: {
      JOB_RADAR_BUILD_DIRECTORY: process.env.JOB_RADAR_BUILD_DIRECTORY ?? "build",
      JOB_RADAR_FIXTURE_PORT: port,
      JOB_RADAR_PERFORMANCE_FIXTURE: "workspace-scale",
    },
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
