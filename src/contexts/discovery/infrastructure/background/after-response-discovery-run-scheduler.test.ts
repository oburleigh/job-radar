import { describe, expect, it, vi } from "vitest";

import type { ForExecutingDiscoveryRuns } from "@/contexts/discovery/application/discovery-runs/execute/execute-discovery-run";
import { createAfterResponseDiscoveryRunScheduler } from "./after-response-discovery-run-scheduler";

const execution = { profileId: 7, providerName: "serper", runId: 41 };

describe("after-response discovery run scheduler", () => {
  it("defers execution until the response lifecycle invokes its callback", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const executeDiscoveryRun = vi.fn(async () => ({ status: "completed" as const }));
    const scheduler = createAfterResponseDiscoveryRunScheduler({
      afterResponse: (callback) => callbacks.push(callback),
      discoveryRuns: { executeDiscoveryRun },
      reportFailure: vi.fn(),
    });

    scheduler.schedule(execution);

    expect(executeDiscoveryRun).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]?.();
    expect(executeDiscoveryRun).toHaveBeenCalledWith({
      ...execution,
      signal: expect.any(AbortSignal),
    });
  });

  it("reports a failed background execution", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const discoveryRuns: ForExecutingDiscoveryRuns = {
      executeDiscoveryRun: async () => ({ status: "failed", message: "Search timed out" }),
    };
    const reportFailure = vi.fn();
    const scheduler = createAfterResponseDiscoveryRunScheduler({
      afterResponse: (callback) => callbacks.push(callback),
      discoveryRuns,
      reportFailure,
    });

    scheduler.schedule(execution);
    await callbacks[0]?.();

    expect(reportFailure).toHaveBeenCalledWith("Discovery run 41 failed: Search timed out");
  });

  it("aborts the scheduled execution when its run is cancelled", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const executeDiscoveryRun = vi.fn(async (requestedExecution) => {
      expect(requestedExecution.signal?.aborted).toBe(true);
      return { status: "cancelled" as const };
    });
    const scheduler = createAfterResponseDiscoveryRunScheduler({
      afterResponse: (callback) => callbacks.push(callback),
      discoveryRuns: { executeDiscoveryRun },
      reportFailure: vi.fn(),
    });

    scheduler.schedule(execution);
    scheduler.cancel(execution.runId);
    await callbacks[0]?.();

    expect(executeDiscoveryRun).toHaveBeenCalledTimes(1);
  });
});
