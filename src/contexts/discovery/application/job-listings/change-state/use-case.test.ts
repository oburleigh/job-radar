import { describe, expect, it, vi } from "vitest";

import { createChangeJobListingState } from "./use-case";

describe("change job listing state", () => {
  it("records the new state at the application clock time", () => {
    const save = vi.fn();
    const changedAt = new Date("2026-08-20T13:00:00.000Z");
    const changeState = createChangeJobListingState({
      states: { save },
      now: () => changedAt,
    });

    const result = changeState({ profileId: 3, jobId: 9, state: "saved" });

    expect(result).toEqual({ status: "changed" });
    expect(save).toHaveBeenCalledWith({ profileId: 3, jobId: 9, state: "saved" }, changedAt);
  });
});
