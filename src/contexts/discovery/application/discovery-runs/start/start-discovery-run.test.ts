import { describe, expect, it } from "vitest";
import type { DiscoveryRunRegistry } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";
import { createDiscoveryRunStarter, type DiscoveryRunScheduler } from "./start-discovery-run";

describe("start discovery run", () => {
  it("reserves and starts a new discovery run", () => {
    const registry = registryReturning({ status: "created", runId: 41 });
    const started: Array<{ profileId: number; providerName: string; runId: number }> = [];
    const scheduler: DiscoveryRunScheduler = {
      schedule: (execution) => started.push(execution),
    };
    const discoveryRuns = createDiscoveryRunStarter({ registry, scheduler });

    const result = discoveryRuns.startDiscoveryRun({ profileId: 7, providerName: "serper" });

    expect(result).toEqual({ status: "started", runId: 41 });
    expect(started).toEqual([{ profileId: 7, providerName: "serper", runId: 41 }]);
  });

  it("reuses an active run without starting a second execution", () => {
    const registry = registryReturning({ status: "already-running", runId: 29 });
    const scheduler: DiscoveryRunScheduler = {
      schedule: () => {
        throw new Error("must not start an existing run again");
      },
    };
    const discoveryRuns = createDiscoveryRunStarter({ registry, scheduler });

    const result = discoveryRuns.startDiscoveryRun({ profileId: 7, providerName: "serper" });

    expect(result).toEqual({ status: "already-running", runId: 29 });
  });
});

function registryReturning(
  result: ReturnType<DiscoveryRunRegistry["reserve"]>,
): DiscoveryRunRegistry {
  return {
    reserve: () => result,
    fail: () => {
      throw new Error("must not fail a run while starting it");
    },
  };
}
