import { describe, expect, it } from "vitest";
import { presentDiscoveryRunOutcome } from "./run-outcome-presentation";

describe("discovery run outcome presentation", () => {
  it.each([
    ["running", "Running", "Discovery is running", "status"],
    ["completed", "Completed", "Discovery completed", "status"],
    ["partial", "Partial", "Discovery partially completed", "alert"],
    ["failed", "Failed", "Discovery failed", "alert"],
    ["cancelled", "Cancelled", "Discovery cancelled", "status"],
  ] as const)("presents %s consistently", (outcome, label, title, liveRole) => {
    expect(presentDiscoveryRunOutcome(outcome)).toEqual({
      kind: outcome,
      label,
      title,
      liveRole,
    });
  });
});
