import { describe, expect, it } from "vitest";

import {
  type DiscoveryRunStatus,
  describeDiscoveryNotice,
  filterCurrentDiscoveryRuns,
  reconcilePendingRunIds,
} from "./discovery-notifications";

describe("discovery notification polling reconciliation", () => {
  it("presents a running run with its current progress", () => {
    expect(
      describeDiscoveryNotice(
        completedRun({
          status: "running",
          outcome: "completed",
          phase: "web-coverage",
          knownBoardCount: 2,
          knownBoardCompletedCount: 2,
          jobsUpserted: 4,
          matchesFound: 1,
        }),
      ),
    ).toEqual({
      kind: "running",
      title: "Discovery running",
      message:
        "Asia leadership: Expanding web coverage · 2 of 2 boards · 4 jobs changed · 1 match found",
    });
  });

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
        knownBoardCompletedCount: 0,
        knownBoardSuccessCount: 0,
        activeBoardName: null,
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
        "Brave Search requires payment. Choose another provider or update its plan. Final totals: 0 boards completed, 4 jobs changed, web coverage failed, and 2 current profile matches.",
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
        knownBoardCompletedCount: 2,
        knownBoardSuccessCount: 1,
        activeBoardName: null,
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
        "Asia leadership completed with 1 board synchronization error. Final totals: 2 boards completed, 4 jobs changed, web coverage completed, and 2 current profile matches.",
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
        "Asia leadership completed with 1 search error. Final totals: 0 boards completed, 4 jobs changed, web coverage completed, and 1 current profile match.",
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
        "Asia leadership completed with 2 search errors. Final totals: 0 boards completed, 4 jobs changed, web coverage completed, and 1 current profile match.",
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
        "Asia leadership completed with 2 search errors and 3 board synchronization errors. Final totals: 0 boards completed, 4 jobs changed, web coverage completed, and 0 current profile matches.",
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
        "Asia leadership completed with 2 board synchronization errors. Final totals: 0 boards completed, 4 jobs changed, web coverage completed, and 0 current profile matches.",
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
      message:
        "Asia leadership: 0 boards completed, 4 jobs changed, web coverage completed, and 2 current profile matches.",
    });
  });

  it("replaces running progress with final board, job, web, and match totals", () => {
    expect(
      describeDiscoveryNotice(
        completedRun({
          knownBoardCount: 5,
          knownBoardCompletedCount: 5,
          knownBoardSuccessCount: 4,
          activeBoardName: null,
          jobsUpserted: 7,
          matchesFound: 3,
          webCoverageStatus: "completed",
        }),
      ),
    ).toEqual({
      kind: "completed",
      title: "Discovery completed",
      message:
        "Asia leadership: 5 boards completed, 7 jobs changed, web coverage completed, and 3 current profile matches.",
    });
  });

  it("reports skipped web coverage after board-only discovery", () => {
    expect(
      describeDiscoveryNotice(
        completedRun({
          provider: "",
          webCoverageStatus: "skipped",
          knownBoardCount: 1,
          knownBoardCompletedCount: 1,
        }),
      ),
    ).toEqual({
      kind: "completed",
      title: "Discovery completed",
      message:
        "Asia leadership: 1 board completed, 4 jobs changed, web coverage skipped, and 2 current profile matches. No web search provider was configured.",
    });
  });

  it("uses the persisted completed count and singular job total in the final summary", () => {
    expect(
      describeDiscoveryNotice(
        completedRun({
          knownBoardCount: 5,
          knownBoardCompletedCount: 2,
          jobsUpserted: 1,
        }),
      ),
    ).toEqual({
      kind: "completed",
      title: "Discovery completed",
      message:
        "Asia leadership: 2 boards completed, 1 job changed, web coverage completed, and 2 current profile matches.",
    });
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
    knownBoardCompletedCount: 0,
    knownBoardSuccessCount: 0,
    activeBoardName: null,
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
