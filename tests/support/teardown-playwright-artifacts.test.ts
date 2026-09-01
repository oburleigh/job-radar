import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import teardownPlaywrightArtifacts from "./teardown-playwright-artifacts";

vi.mock("node:fs", () => ({
  rmSync: vi.fn(),
}));

describe("Playwright artifact teardown", () => {
  const originalDirectory = process.env.JOB_RADAR_E2E_DIRECTORY;
  const originalBuildDirectory = process.env.JOB_RADAR_E2E_BUILD_DIRECTORY;

  afterEach(() => {
    vi.mocked(rmSync).mockReset();
    vi.restoreAllMocks();
    if (originalDirectory === undefined) {
      delete process.env.JOB_RADAR_E2E_DIRECTORY;
    } else {
      process.env.JOB_RADAR_E2E_DIRECTORY = originalDirectory;
    }
    if (originalBuildDirectory === undefined) {
      delete process.env.JOB_RADAR_E2E_BUILD_DIRECTORY;
    } else {
      process.env.JOB_RADAR_E2E_BUILD_DIRECTORY = originalBuildDirectory;
    }
  });

  it("asks Node to retry transient directory locks", () => {
    const directory = path.join(tmpdir(), "job-radar-playwright-test");
    const buildDirectory = path.join(process.cwd(), "build", "playwright-test");
    process.env.JOB_RADAR_E2E_DIRECTORY = directory;
    process.env.JOB_RADAR_E2E_BUILD_DIRECTORY = buildDirectory;

    teardownPlaywrightArtifacts();

    expect(rmSync).toHaveBeenCalledWith(path.resolve(directory), {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
    expect(rmSync).toHaveBeenCalledWith(buildDirectory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  });

  it("schedules cleanup after Playwright has stopped its web servers", async () => {
    const once = vi.spyOn(process, "once").mockReturnValue(process);

    const configUrl = new URL("../../playwright.config.ts", import.meta.url);
    const { default: config } = await import(configUrl.href);

    expect(config.globalTeardown).toBeUndefined();
    expect(once).toHaveBeenCalledWith("exit", teardownPlaywrightArtifacts);
  });
});
