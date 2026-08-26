import { describe, expect, it, vi } from "vitest";
import type { DiscoveryRunRegistry } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";
import { createDiscoveryRunStarter, type DiscoveryRunScheduler } from "./start-discovery-run";

describe("start discovery run", () => {
  it("reserves and starts a new discovery run", () => {
    const registry = registryReturning({ status: "created", runId: 41 });
    const started: Array<{ profileId: number; providerName: string | null; runId: number }> = [];
    const scheduler: DiscoveryRunScheduler = {
      schedule: (execution) => started.push(execution),
      cancel: () => {
        throw new Error("must not cancel a run while starting it");
      },
    };
    const discoveryRuns = createDiscoveryRunStarter({
      work: workReturning({ knownBoardCount: 2, webRequestCount: 3 }),
      registry,
      scheduler,
    });

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
      cancel: () => {
        throw new Error("must not cancel a run while starting it");
      },
    };
    const discoveryRuns = createDiscoveryRunStarter({
      work: workReturning({ knownBoardCount: 0, webRequestCount: 3 }),
      registry,
      scheduler,
    });

    const result = discoveryRuns.startDiscoveryRun({ profileId: 7, providerName: "serper" });

    expect(result).toEqual({ status: "already-running", runId: 29 });
  });

  it("starts a board-only run without a web provider", () => {
    const registry = registryReturning({ status: "created", runId: 41 });
    const started: Array<{ profileId: number; providerName: string | null; runId: number }> = [];
    const discoveryRuns = createDiscoveryRunStarter({
      work: workReturning({ knownBoardCount: 2, webRequestCount: 0 }),
      registry,
      scheduler: {
        schedule: (execution) => started.push(execution),
        cancel: vi.fn(),
      },
    });

    const result = discoveryRuns.startDiscoveryRun({ profileId: 7, providerName: null });

    expect(result).toEqual({ status: "started", runId: 41 });
    expect(started).toEqual([{ profileId: 7, providerName: null, runId: 41 }]);
  });

  it("does not reserve or schedule a run when no work can be admitted", () => {
    const reserve = vi.fn<DiscoveryRunRegistry["reserve"]>();
    const schedule = vi.fn<DiscoveryRunScheduler["schedule"]>();
    const discoveryRuns = createDiscoveryRunStarter({
      work: workReturning({ knownBoardCount: 0, webRequestCount: 0 }),
      registry: {
        reserve,
        cancel: vi.fn(),
        fail: vi.fn(),
      },
      scheduler: { schedule, cancel: vi.fn() },
    });

    const result = discoveryRuns.startDiscoveryRun({ profileId: 7, providerName: null });

    expect(result).toEqual({ status: "not-runnable" });
    expect(reserve).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});

function workReturning(result: { knownBoardCount: number; webRequestCount: number }) {
  return { plan: () => result };
}

function registryReturning(
  result: ReturnType<DiscoveryRunRegistry["reserve"]>,
): DiscoveryRunRegistry {
  return {
    reserve: () => result,
    cancel: () => {
      throw new Error("must not cancel a run while starting it");
    },
    fail: () => {
      throw new Error("must not fail a run while starting it");
    },
  };
}
