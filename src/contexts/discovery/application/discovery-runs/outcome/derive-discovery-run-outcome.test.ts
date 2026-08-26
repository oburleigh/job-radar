import { describe, expect, it } from "vitest";
import {
  type DiscoveryRunOutcomeEvidence,
  deriveDiscoveryRunOutcome,
} from "./derive-discovery-run-outcome";

describe("derive discovery run outcome", () => {
  it.each([
    [evidence({ status: "running" }), "running"],
    [evidence({ status: "cancelled" }), "cancelled"],
    [evidence({ status: "completed", knownBoardCount: 1, knownBoardSuccessCount: 1 }), "completed"],
    [
      evidence({
        status: "completed",
        knownBoardCount: 2,
        knownBoardSuccessCount: 1,
        syncErrorCount: 1,
      }),
      "partial",
    ],
    [
      evidence({
        status: "failed",
        knownBoardCount: 1,
        knownBoardSuccessCount: 1,
        queryCount: 1,
        queryErrorCount: 1,
      }),
      "partial",
    ],
    [
      evidence({
        status: "failed",
        knownBoardCount: 2,
        knownBoardSuccessCount: 0,
        syncErrorCount: 2,
      }),
      "failed",
    ],
    [
      evidence({
        status: "completed",
        queryCount: 2,
        queryErrorCount: 1,
        knownBoardCount: 0,
        knownBoardSuccessCount: 0,
      }),
      "partial",
    ],
    [
      evidence({
        status: "failed",
        queryCount: 1,
        queryErrorCount: 1,
        knownBoardCount: 0,
        knownBoardSuccessCount: 0,
      }),
      "failed",
    ],
    [evidence({ status: "failed" }), "failed"],
  ] as const)("maps persisted evidence to %s", (input, expected) => {
    expect(deriveDiscoveryRunOutcome(input)).toBe(expected);
  });

  it("preserves legacy completed-with-errors behavior when lane fields are absent", () => {
    expect(
      deriveDiscoveryRunOutcome(
        evidence({
          status: "completed",
          knownBoardCount: null,
          knownBoardSuccessCount: null,
          syncErrorCount: 1,
        }),
      ),
    ).toBe("partial");
  });

  it("preserves a legacy failed status when lane fields are absent", () => {
    expect(
      deriveDiscoveryRunOutcome(
        evidence({
          status: "failed",
          knownBoardCount: null,
          knownBoardSuccessCount: null,
        }),
      ),
    ).toBe("failed");
  });

  it.each([
    { knownBoardCount: null, knownBoardSuccessCount: 0 },
    { knownBoardCount: 0, knownBoardSuccessCount: null },
  ] as const)("uses legacy handling when only one lane field is present", (laneEvidence) => {
    expect(
      deriveDiscoveryRunOutcome(
        evidence({
          ...laneEvidence,
          status: "completed",
          syncErrorCount: 1,
        }),
      ),
    ).toBe("partial");
  });

  it("preserves a legacy completed status without errors", () => {
    expect(
      deriveDiscoveryRunOutcome(
        evidence({
          status: "completed",
          knownBoardCount: null,
          knownBoardSuccessCount: null,
        }),
      ),
    ).toBe("completed");
  });
});

function evidence(
  overrides: Partial<DiscoveryRunOutcomeEvidence> = {},
): DiscoveryRunOutcomeEvidence {
  return {
    status: "completed",
    queryCount: 0,
    queryErrorCount: 0,
    syncErrorCount: 0,
    knownBoardCount: 0,
    knownBoardSuccessCount: 0,
    ...overrides,
  };
}
