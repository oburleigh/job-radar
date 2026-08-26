import { describe, expect, it, vi } from "vitest";
import type {
  DiscoverJobsCommand,
  ForDiscoveringJobs,
} from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import type { DiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import { createDiscoveryRunExecution } from "./execute-discovery-run";

const execution: DiscoveryRunExecution = {
  profileId: 7,
  providerName: "serper",
  runId: 41,
};
describe("execute discovery run", () => {
  it("executes a reserved run through job discovery", async () => {
    const executed: DiscoverJobsCommand[] = [];
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async (requestedExecution) => {
        executed.push(requestedExecution);
        return summary;
      },
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    const result = await discoveryRuns.executeDiscoveryRun(execution);

    expect(result).toEqual({ status: "completed" });
    expect(executed).toEqual([execution]);
  });

  it("reports a failed discovery message", async () => {
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => {
        throw new Error("Search provider timed out");
      },
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    const result = await discoveryRuns.executeDiscoveryRun(execution);

    expect(result).toEqual({ status: "failed", message: "Search provider timed out" });
  });

  it("reports a fatal provider stop as failed when no query succeeded", async () => {
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => ({
        ...summary,
        queries: 1,
        hits: 0,
        jobs: 0,
        matches: 0,
        queryErrors: 1,
        providerFailure: {
          provider: "serper",
          classification: "fatal",
          code: "credit-exhausted",
          attempts: 1,
          skippedQueries: 369,
        },
      }),
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    await expect(discoveryRuns.executeDiscoveryRun(execution)).resolves.toEqual({
      status: "failed",
      message: "serper fatal credit-exhausted after 1 attempt; skipped 369 queries",
    });
  });

  it("reports a provider stop as partial when an earlier query succeeded", async () => {
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => ({
        ...summary,
        queries: 2,
        queryErrors: 1,
        providerFailure: {
          provider: "brave",
          classification: "fatal",
          code: "payment-required",
          attempts: 1,
          skippedQueries: 1,
        },
      }),
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    await expect(discoveryRuns.executeDiscoveryRun(execution)).resolves.toEqual({
      status: "partial",
      message: "brave fatal payment-required after 1 attempt; skipped 1 query",
    });
  });

  it("reports the plural attempt count for an exhausted transient failure", async () => {
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => ({
        ...summary,
        hits: 0,
        jobs: 0,
        matches: 0,
        queryErrors: 1,
        providerFailure: {
          provider: "brave",
          classification: "transient",
          code: "rate-limited",
          attempts: 3,
          skippedQueries: 0,
        },
      }),
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    await expect(discoveryRuns.executeDiscoveryRun(execution)).resolves.toEqual({
      status: "failed",
      message: "brave transient rate-limited after 3 attempts; skipped 0 queries",
    });
  });

  it("reports cancellation that wins while discovery returns", async () => {
    const controller = new AbortController();
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => {
        controller.abort(new DOMException("Cancelled by user", "AbortError"));
        return summary;
      },
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    await expect(
      discoveryRuns.executeDiscoveryRun({ ...execution, signal: controller.signal }),
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("reports cancellation that rejects active discovery", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("Cancelled by user", "AbortError");
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => {
        controller.abort(cancellation);
        throw cancellation;
      },
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    await expect(
      discoveryRuns.executeDiscoveryRun({ ...execution, signal: controller.signal }),
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("reports cancellation without converting it to a failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const discovery: ForDiscoveringJobs = {
      discoverJobs: async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      },
    };
    const discoveryRuns = createDiscoveryRunExecution({ discovery });

    const result = await discoveryRuns.executeDiscoveryRun({
      ...execution,
      signal: controller.signal,
    });

    expect(result).toEqual({ status: "cancelled" });
  });

  it("does not start discovery when cancellation already won", async () => {
    const controller = new AbortController();
    controller.abort();
    const discoverJobs = vi.fn<ForDiscoveringJobs["discoverJobs"]>();
    const discoveryRuns = createDiscoveryRunExecution({ discovery: { discoverJobs } });

    const result = await discoveryRuns.executeDiscoveryRun({
      ...execution,
      signal: controller.signal,
    });

    expect(result).toEqual({ status: "cancelled" });
    expect(discoverJobs).not.toHaveBeenCalled();
  });
});

const summary = {
  runId: 41,
  queries: 1,
  hits: 1,
  boards: 0,
  jobs: 1,
  matches: 1,
  queryErrors: 0,
  syncErrors: 0,
};
