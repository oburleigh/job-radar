import { describe, expect, it, vi } from "vitest";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import type {
  DiscoveryRunJournal,
  DiscoveryRunProgress,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import type { JobDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/job-discovery-catalog";
import type { SearchProvider } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { SearchProviderFailure } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { SearchProviderDirectory } from "@/contexts/discovery/application/discovery-runs/ports/search-provider-directory";

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
      jobs: { recordHit, synchronizeBoard },
      matches: { evaluate: evaluateMatches },
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
    expect(evaluateMatches).toHaveBeenCalledWith(7, expect.any(Function), expect.any(Function));
    expect(yieldControl).toHaveBeenCalledTimes(2);
    expect(journal.progressRecords).toHaveLength(4);
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
      },
      matches: { evaluate: vi.fn(async () => ({ matched: 0 })) },
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

  it("does not call an empty query plan a failed search", async () => {
    const journal = recordingJournal();
    const search = vi.fn();
    const discovery = createJobDiscovery({
      setup: {
        load: (command) => ({ ...configuredSetup().load(command), sources: [] }),
      },
      runs: journal,
      jobs: { recordHit: vi.fn(), synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn(async () => ({ matched: 0 })) },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    await discovery.discoverJobs({
      profileId: 7,
      providerName: "serper",
      runId: 41,
      syncBoards: false,
    });

    expect(search).not.toHaveBeenCalled();
    expect(journal.completed).toEqual([expect.objectContaining({ allQueriesFailed: false })]);
  });

  it.each([
    ["serper", "credit-exhausted"],
    ["brave", "payment-required"],
  ] as const)("stops 370 %s queries after one fatal %s response", async (providerName, code) => {
    const baseJournal = recordingJournal();
    const journal: DiscoveryRunJournal & typeof baseJournal = {
      ...baseJournal,
      planQueries: (_runId, queries) => {
        const firstQuery = queries[0];
        if (!firstQuery) {
          throw new Error("The fatal-provider test requires one planned query.");
        }
        return Array.from({ length: 370 }, (_, index) => ({
          ...firstQuery,
          id: index + 1,
        }));
      },
    };
    const search = vi.fn(async () => {
      throw new SearchProviderFailure({
        provider: providerName,
        classification: "fatal",
        code,
        attempts: 1,
        message: `${providerName} cannot continue`,
      });
    });
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit: vi.fn(), synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn(async () => ({ matched: 0 })) },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    const summary = await discovery.discoverJobs({
      profileId: 7,
      providerName,
      runId: 41,
      syncBoards: false,
    });

    expect(search).toHaveBeenCalledOnce();
    expect(summary.providerFailure).toEqual({
      provider: providerName,
      classification: "fatal",
      code,
      attempts: 1,
      skippedQueries: 369,
    });
    expect(journal.completed[0]?.errors).toContain(
      `${providerName} fatal ${code} after 1 attempt; skipped 369 queries`,
    );
    expect(journal.completed[0]?.allQueriesFailed).toBe(true);
    expect(journal.queryFailures).toEqual([
      { queryId: 1, message: `${providerName} cannot continue`, finishedAt: timestamp },
    ]);
    expect(journal.cancelledQueryBatches).toEqual([
      {
        runId: 41,
        message: `Skipped because ${providerName} reported ${code}.`,
        finishedAt: timestamp,
      },
    ]);
    expect(journal.progressRecords).toHaveLength(1);
  });

  it("counts only the queries left after a fatal response", async () => {
    const baseJournal = recordingJournal();
    const journal: DiscoveryRunJournal & typeof baseJournal = {
      ...baseJournal,
      planQueries: (_runId, queries) => {
        const firstQuery = queries[0];
        if (!firstQuery) {
          throw new Error("The partial-provider test requires one planned query.");
        }
        return Array.from({ length: 3 }, (_, index) => ({ ...firstQuery, id: index + 1 }));
      },
    };
    const search = vi
      .fn<SearchProvider["search"]>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        new SearchProviderFailure({
          provider: "serper",
          classification: "fatal",
          code: "credit-exhausted",
          attempts: 1,
          message: "Serper.dev has no credits",
        }),
      );
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit: vi.fn(), synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn(async () => ({ matched: 0 })) },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    const summary = await discovery.discoverJobs({
      profileId: 7,
      providerName: "serper",
      runId: 41,
      syncBoards: false,
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(summary.providerFailure?.skippedQueries).toBe(1);
    expect(journal.completed[0]?.allQueriesFailed).toBe(false);
    expect(journal.cancelledQueryBatches).toHaveLength(1);
  });

  it("stops the provider lane after an exhausted transient failure", async () => {
    const journal = recordingJournal();
    const search = vi.fn(async () => {
      throw new SearchProviderFailure({
        provider: "brave",
        classification: "transient",
        code: "rate-limited",
        attempts: 3,
        message: "Brave Search returned HTTP 429",
      });
    });
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit: vi.fn(), synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn(async () => ({ matched: 0 })) },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    const summary = await discovery.discoverJobs({
      profileId: 7,
      providerName: "brave",
      runId: 41,
      syncBoards: false,
    });

    expect(search).toHaveBeenCalledOnce();
    expect(summary.providerFailure).toEqual({
      provider: "brave",
      classification: "transient",
      code: "rate-limited",
      attempts: 3,
      skippedQueries: 1,
    });
    expect(journal.completed[0]?.errors).toContain(
      "brave transient rate-limited after 3 attempts; skipped 1 query",
    );
    expect(journal.completed[0]?.errors).toHaveLength(1);
    expect(journal.queryFailures).toHaveLength(1);
    expect(journal.cancelledQueryBatches).toHaveLength(1);
    expect(journal.progressRecords).toHaveLength(1);
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
      },
      matches: { evaluate: vi.fn() },
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
    expect(journal.cancelledQueryBatches).toEqual([
      {
        runId: 41,
        message: "Skipped because the discovery run failed: Could not store search result",
        finishedAt: timestamp,
      },
    ]);
  });

  it("records the run without failing a completed query when match evaluation fails", async () => {
    const journal = recordingJournal();
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: {
        recordHit: vi.fn(async () => ({ inserted: false, jobsWritten: 0 })),
        synchronizeBoard: vi.fn(),
      },
      matches: {
        evaluate: vi.fn(async () => {
          throw new Error("Could not evaluate matches");
        }),
      },
      providers: providerDirectory(async () => []),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    await expect(
      discovery.discoverJobs({
        profileId: 7,
        providerName: "serper",
        runId: 41,
        syncBoards: false,
      }),
    ).rejects.toThrow("Could not evaluate matches");

    expect(journal.queryFailures).toEqual([]);
    expect(journal.cancelledQueryBatches).toEqual([
      {
        runId: 41,
        message: "Skipped because the discovery run failed: Could not evaluate matches",
        finishedAt: timestamp,
      },
    ]);
  });

  it("stops before starting another provider batch after cancellation", async () => {
    const controller = new AbortController();
    const journal = recordingJournal();
    const search = vi.fn(async (_query: string, request?: { signal?: AbortSignal }) => {
      expect(request?.signal).toBe(controller.signal);
      return [
        {
          title: "VP Engineering",
          url: "https://jobs.example.com/vp-engineering",
          snippet: "Engineering leadership in Dubai",
        },
      ];
    });
    const recordHit = vi.fn(async () => ({
      inserted: true,
      jobsWritten: 1,
    }));
    const yieldControl = vi.fn(async () => {
      controller.abort("Cancelled by user");
    });
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit, synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn() },
      providers: providerDirectory(search),
      now: () => timestamp,
      yieldControl,
    });

    await expect(
      discovery.discoverJobs({
        profileId: 7,
        providerName: "serper",
        runId: 41,
        syncBoards: false,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(search).toHaveBeenCalledOnce();
    expect(recordHit).toHaveBeenCalledOnce();
    expect(journal.completed).toEqual([]);
    expect(journal.failed).toEqual([]);
  });

  it("does not record a provider failure when cancellation rejects the active request", async () => {
    const controller = new AbortController();
    const journal = recordingJournal();
    const cancellation = new DOMException("Cancelled by user", "AbortError");
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: { recordHit: vi.fn(), synchronizeBoard: vi.fn() },
      matches: { evaluate: vi.fn() },
      providers: providerDirectory(async () => {
        controller.abort(cancellation);
        throw cancellation;
      }),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    await expect(
      discovery.discoverJobs({
        profileId: 7,
        providerName: "serper",
        runId: 41,
        syncBoards: false,
        signal: controller.signal,
      }),
    ).rejects.toBe(cancellation);

    expect(journal.queryFailures).toEqual([]);
    expect(journal.progressRecords).toEqual([]);
    expect(journal.completed).toEqual([]);
    expect(journal.failed).toEqual([]);
  });

  it("stops before a later evaluation batch after cancellation", async () => {
    const controller = new AbortController();
    const journal = recordingJournal();
    const discovery = createJobDiscovery({
      setup: configuredSetup(),
      runs: journal,
      jobs: {
        recordHit: vi.fn(async () => ({ inserted: false, jobsWritten: 0 })),
        synchronizeBoard: vi.fn(),
      },
      matches: {
        evaluate: async (_profileId, _onBatch, beforeBatch) => {
          beforeBatch?.();
          controller.abort("Cancelled by user");
          beforeBatch?.();
          return { matched: 0 };
        },
      },
      providers: providerDirectory(async () => []),
      now: () => timestamp,
      yieldControl: vi.fn(),
    });

    await expect(
      discovery.discoverJobs({
        profileId: 7,
        providerName: "serper",
        runId: 41,
        syncBoards: false,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(journal.completed).toEqual([]);
    expect(journal.failed).toEqual([]);
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
  readonly progressRecords: Array<DiscoveryRunProgress>;
  readonly cancelledQueryBatches: Array<{
    readonly runId: number;
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
  const progressRecords: Array<DiscoveryRunProgress> = [];
  const cancelledQueryBatches: Array<{
    readonly runId: number;
    readonly message: string;
    readonly finishedAt: Date;
  }> = [];
  return {
    cancelledQueryBatches,
    completed,
    failed,
    queryFailures,
    progressRecords,
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
    cancelPlannedQueries: (runId, message, finishedAt) => {
      cancelledQueryBatches.push({ runId, message, finishedAt });
    },
    recordProgress: (_runId, progress) => {
      progressRecords.push(progress);
    },
    complete: (request) => completed.push(request),
    fail: (request) => failed.push(request),
  };
}
