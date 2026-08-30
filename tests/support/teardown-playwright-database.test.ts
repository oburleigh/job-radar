import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import teardownPlaywrightDatabase from "./teardown-playwright-database";

vi.mock("node:fs", () => ({
  rmSync: vi.fn(),
}));

describe("Playwright database teardown", () => {
  const originalDirectory = process.env.JOB_RADAR_E2E_DIRECTORY;

  afterEach(() => {
    vi.mocked(rmSync).mockReset();
    if (originalDirectory === undefined) {
      delete process.env.JOB_RADAR_E2E_DIRECTORY;
      return;
    }
    process.env.JOB_RADAR_E2E_DIRECTORY = originalDirectory;
  });

  it("asks Node to retry transient directory locks", () => {
    const directory = path.join(tmpdir(), "job-radar-playwright-test");
    process.env.JOB_RADAR_E2E_DIRECTORY = directory;

    teardownPlaywrightDatabase();

    expect(rmSync).toHaveBeenCalledWith(path.resolve(directory), {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  });
});
