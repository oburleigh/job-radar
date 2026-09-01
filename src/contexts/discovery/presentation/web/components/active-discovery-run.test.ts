import { describe, expect, it } from "vitest";

import {
  type ActiveDiscoveryRunState,
  describeDiscoveryPhase,
  describeDiscoveryProgress,
} from "./active-discovery-run";

describe("active discovery run progress", () => {
  it.each([
    [{ phase: "known-boards", knownBoardCount: 2 }, "Synchronizing company boards"],
    [
      { phase: "web-coverage", knownBoardCount: 0 },
      "No enabled company boards; expanding web coverage",
    ],
    [{ phase: "web-coverage", knownBoardCount: 2 }, "Expanding web coverage"],
    [{ phase: "matching", knownBoardCount: 2 }, "Matching jobs to profile"],
  ] as const)("describes the active discovery phase", (overrides, expected) => {
    expect(describeDiscoveryPhase(activeRun(overrides))).toBe(expected);
  });

  it("describes persisted board progress and matches in one running update", () => {
    expect(
      describeDiscoveryProgress(
        activeRun({
          phase: "known-boards",
          knownBoardCount: 5,
          knownBoardCompletedCount: 2,
          activeBoardName: "Beta Systems",
          jobsUpserted: 7,
          matchesFound: 3,
        }),
      ),
    ).toBe(
      "Synchronizing company boards · 2 of 5 boards · Active board: Beta Systems · 7 jobs changed · 3 matches found",
    );
  });

  it("omits an absent active board while preserving singular running totals", () => {
    expect(
      describeDiscoveryProgress(
        activeRun({
          phase: "known-boards",
          knownBoardCount: null,
          knownBoardCompletedCount: null,
          activeBoardName: null,
          jobsUpserted: 1,
          matchesFound: 1,
        }),
      ),
    ).toBe("Synchronizing company boards · 0 of 0 boards · 1 job changed · 1 match found");
  });
});

function activeRun(overrides: Partial<ActiveDiscoveryRunState> = {}): ActiveDiscoveryRunState {
  return {
    id: 41,
    profileName: "Asia leadership",
    phase: "matching",
    knownBoardCount: 0,
    knownBoardCompletedCount: 0,
    activeBoardName: null,
    jobsUpserted: 4,
    matchesFound: 2,
    ...overrides,
  };
}
