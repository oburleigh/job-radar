import { describe, expect, it } from "vitest";

import {
  type DiscoveryRunStatus,
  describeDiscoveryNotice,
  describeDiscoveryPhase,
  filterCurrentDiscoveryRuns,
  reconcilePendingRunIds,
} from "./discovery-notifications";

describe("discovery notification polling reconciliation", () => {
  it("removes ids omitted by a storage event and suppresses their re-adoption", () => {
    const pendingIds = new Set([41, 42]);
    const suppressedIds = new Set<number>();

    reconcilePendingRunIds(pendingIds, [42], suppressedIds);

    expect([...pendingIds]).toEqual([42]);
    expect([...suppressedIds]).toEqual([41]);
  });

  it("drops delayed statuses that are no longer pending", () => {
    const delayedRuns = [{ id: 41 }, { id: 42 }, { id: 43 }];

    expect(filterCurrentDiscoveryRuns(delayedRuns, new Set([42]), new Set([43]))).toEqual([
      { id: 42 },
    ]);
  });

  it("presents a completed run with provider errors as an actionable partial result", () => {
    expect(
      describeDiscoveryNotice({
        id: 41,
        profileId: 7,
        profileName: "Asia leadership",
        provider: "brave",
        status: "completed",
        outcome: "partial",
        phase: "matching",
        knownBoardCount: 0,
        knownBoardSuccessCount: 0,
        webCoverageStatus: "failed",
        hitCount: 5,
        jobsUpserted: 4,
        matchesFound: 2,
        queryErrorCount: 1,
        syncErrorCount: 0,
        errorSummary: "brave fatal payment-required after 1 attempt; skipped 12 queries",
      }),
    ).toEqual({
      kind: "partial",
      title: "Discovery partially completed",
      message:
        "Brave Search requires payment. Choose another provider or update its plan. 2 current profile matches were retained.",
    });
  });

  it("describes a sync-only partial run as completed with a synchronization error", () => {
    expect(
      describeDiscoveryNotice({
        id: 41,
        profileId: 7,
        profileName: "Asia leadership",
        provider: "brave",
        status: "completed",
        outcome: "partial",
        phase: "matching",
        knownBoardCount: 2,
        knownBoardSuccessCount: 1,
        webCoverageStatus: "completed",
        hitCount: 5,
        jobsUpserted: 4,
        matchesFound: 2,
        queryErrorCount: 0,
        syncErrorCount: 1,
        errorSummary: "",
      }),
    ).toEqual({
      kind: "partial",
      title: "Discovery partially completed",
      message:
        "Asia leadership completed with 1 board synchronization error. 2 current profile matches were retained.",
    });
  });

  it.each([
    {
      name: "singular query fallback",
      run: {
        outcome: "partial" as const,
        queryErrorCount: 1,
        syncErrorCount: 0,
        errorSummary: "",
        matchesFound: 1,
      },
      message:
        "Asia leadership completed with 1 search error. 1 current profile match was retained.",
    },
    {
      name: "query-only fallback",
      run: {
        outcome: "partial" as const,
        queryErrorCount: 2,
        syncErrorCount: 0,
        errorSummary: "",
        matchesFound: 1,
      },
      message:
        "Asia leadership completed with 2 search errors. 1 current profile match was retained.",
    },
    {
      name: "combined fallback",
      run: {
        outcome: "partial" as const,
        queryErrorCount: 2,
        syncErrorCount: 3,
        errorSummary: "",
        matchesFound: 0,
      },
      message:
        "Asia leadership completed with 2 search errors and 3 board synchronization errors. 0 current profile matches were retained.",
    },
    {
      name: "whitespace-only sync fallback",
      run: {
        outcome: "partial" as const,
        queryErrorCount: 0,
        syncErrorCount: 2,
        errorSummary: "   ",
        matchesFound: 0,
      },
      message:
        "Asia leadership completed with 2 board synchronization errors. 0 current profile matches were retained.",
    },
  ])("formats the $name", ({ run, message }) => {
    expect(describeDiscoveryNotice(completedRun(run))).toEqual({
      kind: "partial",
      title: "Discovery partially completed",
      message,
    });
  });

  it("keeps an error-free completed run out of the partial branch", () => {
    expect(describeDiscoveryNotice(completedRun())).toEqual({
      kind: "completed",
      title: "Discovery completed",
      message: "Asia leadership: 2 current profile matches after processing 5 search results.",
    });
  });

  it("reports skipped web coverage after board-only discovery", () => {
    expect(
      describeDiscoveryNotice(
        completedRun({ provider: "", webCoverageStatus: "skipped", knownBoardCount: 1 }),
      ),
    ).toEqual({
      kind: "completed",
      title: "Discovery completed",
      message:
        "Asia leadership: 2 current profile matches after processing 5 search results. Web coverage was skipped because no provider was configured.",
    });
  });

  it.each([
    [{ phase: "known-boards", knownBoardCount: 2 }, "Refreshing known boards"],
    [
      { phase: "web-coverage", knownBoardCount: 0 },
      "No enabled company boards; expanding web coverage",
    ],
    [{ phase: "web-coverage", knownBoardCount: 2 }, "Expanding web coverage"],
    [{ phase: "matching", knownBoardCount: 2 }, "Matching jobs to profile"],
  ] as const)("describes the active discovery phase", (overrides, expected) => {
    expect(describeDiscoveryPhase(completedRun({ ...overrides, outcome: "running" }))).toBe(
      expected,
    );
  });
});

function completedRun(overrides: Partial<DiscoveryRunStatus> = {}): DiscoveryRunStatus {
  return {
    id: 41,
    profileId: 7,
    profileName: "Asia leadership",
    provider: "brave",
    status: "completed",
    outcome: "completed",
    phase: "matching",
    knownBoardCount: 0,
    knownBoardSuccessCount: 0,
    webCoverageStatus: "completed",
    hitCount: 5,
    jobsUpserted: 4,
    matchesFound: 2,
    queryErrorCount: 0,
    syncErrorCount: 0,
    errorSummary: "",
    ...overrides,
  };
}
