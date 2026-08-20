import { describe, expect, it } from "vitest";

import { jobListingIdFrom, searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import type { ChangeJobListingStateCommand } from "./command";
import { createChangeJobListingState } from "./use-case";

describe("change job listing state", () => {
  it("records the new state at the application clock time", () => {
    const saved: Array<{ command: ChangeJobListingStateCommand; changedAt: Date }> = [];
    const changedAt = new Date("2026-08-20T13:00:00.000Z");
    const changeState = createChangeJobListingState({
      states: {
        save(command, savedAt) {
          saved.push({ command, changedAt: savedAt });
        },
      },
      now: () => changedAt,
    });
    const profileId = searchProfileIdFrom(3);
    const jobId = jobListingIdFrom(9);
    if (!profileId || !jobId) {
      throw new Error("Test identifiers must be valid");
    }

    const result = changeState({ profileId, jobId, state: "saved" });

    expect(result).toEqual({ status: "changed" });
    expect(saved).toEqual([{ command: { profileId: 3, jobId: 9, state: "saved" }, changedAt }]);
  });
});
