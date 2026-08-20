import { describe, expect, it } from "vitest";

import { createSyncSourceCoverage } from "./use-case";

describe("sync source coverage", () => {
  it("summarizes board writes and failures", async () => {
    const sync = createSyncSourceCoverage({
      boards: {
        syncEnabledBoards: async () => [
          { created: 2, updated: 3 },
          { created: 0, updated: 1, error: "unavailable" },
        ],
      },
    });

    await expect(sync()).resolves.toEqual({
      status: "completed",
      boardCount: 2,
      writeCount: 6,
      failureCount: 1,
    });
  });
});
