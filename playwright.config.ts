import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3100";
const isCi = process.env.CI !== undefined;
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
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
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: BASE_URL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
