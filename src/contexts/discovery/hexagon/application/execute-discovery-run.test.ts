import { describe, expect, it } from "vitest";

import type { DiscoveryRunExecution } from "./discovery-run";
import type { DiscoveryRunRegistry } from "./discovery-run-registry";
import { createDiscoveryRunExecution, type DiscoverySearch } from "./execute-discovery-run";

const execution: DiscoveryRunExecution = {
  profileId: 7,
  providerName: "serper",
  runId: 41,
};
const finishedAt = new Date("2026-08-20T09:30:00.000Z");

describe("execute discovery run", () => {
  it("executes a reserved run through the discovery search port", async () => {
    const executed: DiscoveryRunExecution[] = [];
    const search: DiscoverySearch = {
      execute: async (requestedExecution) => {
        executed.push(requestedExecution);
      },
    };
    const registry = recordingRegistry();
    const discoveryRuns = createDiscoveryRunExecution({ search, registry, now: () => finishedAt });

    const result = await discoveryRuns.executeDiscoveryRun(execution);

    expect(result).toEqual({ status: "completed" });
    expect(executed).toEqual([execution]);
    expect(registry.failures).toEqual([]);
  });

  it("records a failed run and reports its message", async () => {
    const search: DiscoverySearch = {
      execute: async () => {
        throw new Error("Search provider timed out");
      },
    };
    const registry = recordingRegistry();
    const discoveryRuns = createDiscoveryRunExecution({ search, registry, now: () => finishedAt });

    const result = await discoveryRuns.executeDiscoveryRun(execution);

    expect(result).toEqual({ status: "failed", message: "Search provider timed out" });
    expect(registry.failures).toEqual([
      { runId: 41, message: "Search provider timed out", finishedAt },
    ]);
  });
});

function recordingRegistry(): DiscoveryRunRegistry & {
  readonly failures: Array<{ runId: number; message: string; finishedAt: Date }>;
} {
  const failures: Array<{ runId: number; message: string; finishedAt: Date }> = [];
  return {
    failures,
    reserve: () => {
      throw new Error("must not reserve a run while executing it");
    },
    fail: (failure) => failures.push(failure),
  };
}
