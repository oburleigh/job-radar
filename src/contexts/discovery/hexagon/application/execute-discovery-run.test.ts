import { describe, expect, it } from "vitest";
import type { DiscoverJobsCommand, ForDiscoveringJobs } from "./discover-jobs";
import type { DiscoveryRunExecution } from "./discovery-run";
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
