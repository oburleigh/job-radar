import { describe, expect, it, vi } from "vitest";
import { createJobDiscovery } from "./discover-jobs";
import type { DiscoveryRunJournal } from "./discovery-run-journal";
import type { DiscoverySetupReader } from "./discovery-setup";
import type { JobDiscoveryCatalog } from "./job-discovery-catalog";
import type { SearchProvider } from "./search-provider";
import type { SearchProviderDirectory } from "./search-provider-directory";

const timestamp = new Date("2026-08-20T12:00:00.000Z");

describe("discover jobs", () => {
  it("plans, searches, records, synchronizes, and evaluates a discovery run", async () => {
    const journal = recordingJournal();
    const search = vi.fn(async () => [
      {
        title: "VP Engineering",
        url: "https://jobs.example.com/vp-engineering",
        snippet: "Engineering leadership in Dubai",
      },
    ]);
    const recordHit = vi
      .fn<JobDiscoveryCatalog["recordHit"]>()
      .mockResolvedValueOnce({ inserted: true, jobsWritten: 1, syncableBoardId: 11 })
      .mockResolvedValueOnce({ inserted: false, jobsWritten: 1, syncableBoardId: 11 });
    const synchronizeBoard = vi.fn(async () => ({ jobsWritten: 3, error: "" }));
    const evaluateMatches = vi.fn(async (_profileId: number, onBatch: () => void) => {
      onBatch();
      return { matched: 5 };
    });
    const yieldControl = vi.fn(async () => undefined);
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit, synchronizeBoard, evaluateMatches },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl,
    });

    const summary = await discovery.discoverJobs({
      profileId: 7,
      providerName: "serper",
      runId: 41,
    });

    expect(summary).toEqual({
      runId: 41,
      queries: 2,
      hits: 1,
      boards: 1,
      jobs: 5,
      matches: 5,
      queryErrors: 0,
      syncErrors: 0,
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith(expect.any(String), { count: 25, maxAgeDays: 30 });
    expect(recordHit).toHaveBeenCalledTimes(2);
    expect(synchronizeBoard).toHaveBeenCalledOnce();
    expect(synchronizeBoard).toHaveBeenCalledWith(11, 200);
    expect(evaluateMatches).toHaveBeenCalledWith(7, expect.any(Function));
    expect(yieldControl).toHaveBeenCalledTimes(2);
    expect(journal.completed).toEqual([
      expect.objectContaining({
        runId: 41,
        boardsDiscovered: 1,
        matchesFound: 5,
        allQueriesFailed: false,
      }),
    ]);
    expect(journal.failed).toEqual([]);
  });

  it("finishes a run as failed when every planned query is rejected by the provider", async () => {
    const journal = recordingJournal();
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: {
        recordHit: vi.fn(),
        synchronizeBoard: vi.fn(),
        evaluateMatches: vi.fn(async () => ({ matched: 0 })),
      },
      providers: providerDirectory(async () => {
        throw new Error("Search provider timed out");
      }),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    const summary = await discovery.discoverJobs({
      profileId: 7,
      providerName: "serper",
      runId: 41,
      syncBoards: false,
    });

    expect(summary.queryErrors).toBe(2);
    expect(journal.queryFailures).toHaveLength(2);
    expect(journal.completed).toEqual([
      expect.objectContaining({
        allQueriesFailed: true,
        errors: [
          "jobs.example.com / VP Engineering: Search provider timed out",
          "jobs.example.com / Board discovery: Search provider timed out",
        ],
      }),
    ]);
  });

  it("records the active query and run when hit processing fails", async () => {
    const journal = recordingJournal();
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: {
        recordHit: async () => {
          throw new Error("Could not store search result");
        },
        synchronizeBoard: vi.fn(),
        evaluateMatches: vi.fn(),
      },
      providers: providerDirectory(async () => [
        { title: "VP Engineering", url: "https://example.com/job", snippet: "Dubai" },
      ]),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    await expect(
      discovery.discoverJobs({ profileId: 7, providerName: "serper", runId: 41 }),
    ).rejects.toThrow("Could not store search result");
    expect(journal.queryFailures).toEqual([
      { queryId: 1, message: "Could not store search result", finishedAt: timestamp },
    ]);
    expect(journal.failed).toEqual([
      expect.objectContaining({ runId: 41, message: "Could not store search result" }),
    ]);
  });
});

function configuredSetup(): DiscoverySetupReader {
  return {
    load: () => ({
      profile: {
        id: 7,
        titleTerms: ["VP Engineering"],
        locationTerms: ["Dubai"],
        includeRemote: false,
        maxAgeDays: 60,
      },
      sources: [{ atsType: "greenhouse", pattern: "jobs.example.com", supportsBoardSync: true }],
      policy: {
        resultsPerQuery: 25,
        boardJobLimit: 200,
        searchFreshnessDays: 30,
        workYieldBatchSize: 1,
        titleSearchMode: "title",
        worldwideRemoteTerms: ["remote"],
      },
    }),
  };
}

function providerDirectory(search: SearchProvider["search"]): SearchProviderDirectory {
  return { get: (name) => ({ name, search }) };
}

function recordingJournal(): DiscoveryRunJournal & {
  readonly completed: Array<Parameters<DiscoveryRunJournal["complete"]>[0]>;
  readonly failed: Array<Parameters<DiscoveryRunJournal["fail"]>[0]>;
  readonly queryFailures: Array<{
    readonly queryId: number;
    readonly message: string;
    readonly finishedAt: Date;
  }>;
} {
  const completed: Array<Parameters<DiscoveryRunJournal["complete"]>[0]> = [];
  const failed: Array<Parameters<DiscoveryRunJournal["fail"]>[0]> = [];
  const queryFailures: Array<{
    readonly queryId: number;
    readonly message: string;
    readonly finishedAt: Date;
  }> = [];
  return {
    completed,
    failed,
    queryFailures,
    prepare: ({ runId = 99, profileId, providerName }) => ({
      id: runId,
      profileId,
      providerName,
    }),
    planQueries: (_runId, queries) => queries.map((query, index) => ({ ...query, id: index + 1 })),
    startQuery: () => undefined,
    completeQuery: () => undefined,
    failQuery: (queryId, message, finishedAt) => {
      queryFailures.push({ queryId, message, finishedAt });
    },
    recordProgress: () => undefined,
    complete: (request) => completed.push(request),
    fail: (request) => failed.push(request),
  };
}
