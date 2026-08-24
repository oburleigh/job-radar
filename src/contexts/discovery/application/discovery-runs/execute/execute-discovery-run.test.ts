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
