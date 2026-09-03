import { describe, expect, it } from "vitest";

import { type RevalidationState, shouldSchedulePoll } from "./use-revalidation-poll";

describe("revalidation poll scheduling", () => {
  it("schedules only while the caller wants it, the tab is visible, and nothing is in flight", () => {
    expect(cases()).toEqual([
      { documentIsVisible: true, enabled: true, revalidationState: "idle", scheduled: true },
      { documentIsVisible: true, enabled: true, revalidationState: "loading", scheduled: false },
      { documentIsVisible: false, enabled: true, revalidationState: "idle", scheduled: false },
      { documentIsVisible: false, enabled: true, revalidationState: "loading", scheduled: false },
      { documentIsVisible: true, enabled: false, revalidationState: "idle", scheduled: false },
      { documentIsVisible: true, enabled: false, revalidationState: "loading", scheduled: false },
      { documentIsVisible: false, enabled: false, revalidationState: "idle", scheduled: false },
      { documentIsVisible: false, enabled: false, revalidationState: "loading", scheduled: false },
    ]);
  });
});

function cases() {
  const states: readonly RevalidationState[] = ["idle", "loading"];
  return [true, false].flatMap((enabled) =>
    [true, false].flatMap((documentIsVisible) =>
      states.map((revalidationState) => ({
        documentIsVisible,
        enabled,
        revalidationState,
        scheduled: shouldSchedulePoll({ documentIsVisible, enabled, revalidationState }),
      })),
    ),
  );
}
