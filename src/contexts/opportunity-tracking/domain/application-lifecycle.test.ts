import { describe, expect, it } from "vitest";

import { changeApplicationStage } from "./application-lifecycle";

describe("Application stage changes", () => {
  it("moves through the lifecycle one accepted stage at a time", () => {
    expect(changeApplicationStage("preparing", "applied", "advance")).toEqual({
      accepted: true,
      entryKind: "stage-changed",
      stage: "applied",
    });
    expect(changeApplicationStage("applied", "screening", "advance")).toMatchObject({
      accepted: true,
      stage: "screening",
    });
    expect(changeApplicationStage("screening", "interviewing", "advance")).toMatchObject({
      accepted: true,
      stage: "interviewing",
    });
    expect(changeApplicationStage("interviewing", "offer", "advance")).toMatchObject({
      accepted: true,
      stage: "offer",
    });
    expect(changeApplicationStage("offer", "closed", "advance")).toMatchObject({
      accepted: true,
      stage: "closed",
    });
  });

  it("rejects skipped, backward, repeated, and post-Closed ordinary changes", () => {
    expect(changeApplicationStage("preparing", "screening", "advance")).toEqual({
      accepted: false,
      reason: "invalid-stage-transition",
    });
    expect(changeApplicationStage("interviewing", "screening", "advance")).toEqual({
      accepted: false,
      reason: "invalid-stage-transition",
    });
    expect(changeApplicationStage("applied", "applied", "advance")).toEqual({
      accepted: false,
      reason: "stage-unchanged",
    });
    expect(changeApplicationStage("closed", "preparing", "advance")).toEqual({
      accepted: false,
      reason: "invalid-stage-transition",
    });
  });

  it("records an explicit correction separately from an ordinary stage change", () => {
    expect(changeApplicationStage("offer", "screening", "correction")).toEqual({
      accepted: true,
      entryKind: "stage-corrected",
      stage: "screening",
    });
    expect(changeApplicationStage("screening", "screening", "correction")).toEqual({
      accepted: false,
      reason: "stage-unchanged",
    });
  });
});
