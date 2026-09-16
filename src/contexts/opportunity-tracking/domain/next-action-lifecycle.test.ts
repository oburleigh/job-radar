import { describe, expect, it } from "vitest";

import { changeNextAction } from "./next-action-lifecycle";

describe("Next action changes", () => {
  const open = { state: "open" as const, dueAt: new Date("2026-09-15T09:00:00.000Z") };

  it("completes and dismisses an open Next action", () => {
    expect(changeNextAction(open, { kind: "complete" })).toEqual({
      accepted: true,
      dueAt: open.dueAt,
      state: "completed",
    });
    expect(changeNextAction(open, { kind: "dismiss" })).toEqual({
      accepted: true,
      dueAt: open.dueAt,
      state: "dismissed",
    });
  });

  it("defers an open Next action to the requested due time", () => {
    const dueAt = new Date("2026-09-18T12:00:00.000Z");
    expect(changeNextAction(open, { kind: "defer", dueAt })).toEqual({
      accepted: true,
      dueAt,
      state: "deferred",
    });
  });

  it("reopens completed, dismissed, and deferred actions without retaining a deferred due time", () => {
    for (const state of ["completed", "dismissed", "deferred"] as const) {
      expect(changeNextAction({ state, dueAt: open.dueAt }, { kind: "reopen" })).toEqual({
        accepted: true,
        dueAt: state === "deferred" ? null : open.dueAt,
        state: "open",
      });
    }
  });

  it("rejects commands that do not apply to the current state", () => {
    expect(changeNextAction(open, { kind: "reopen" })).toEqual({
      accepted: false,
      reason: "invalid-next-action-change",
    });
    expect(changeNextAction({ state: "completed", dueAt: null }, { kind: "complete" })).toEqual({
      accepted: false,
      reason: "invalid-next-action-change",
    });
  });
});
