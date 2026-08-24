import { describe, expect, it, vi } from "vitest";
import type {
  DiscoveryRunCancellation,
  DiscoveryRunRegistry,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";
import {
  createDiscoveryRunCanceller,
  type DiscoveryRunCancellationScheduler,
} from "./cancel-discovery-run";

describe("cancel discovery run", () => {
  it("persists cancellation before aborting the scheduled execution", () => {
    const finishedAt = new Date("2026-08-24T12:00:00.000Z");
    const registry = registryReturning({ status: "cancelled", runId: 41 });
    const scheduler: DiscoveryRunCancellationScheduler = {
      cancel: vi.fn(),
    };
    const discoveryRuns = createDiscoveryRunCanceller({
      registry,
      scheduler,
      now: () => finishedAt,
    });

    const result = discoveryRuns.cancelDiscoveryRun({ runId: 41 });

    expect(result).toEqual({ status: "cancelled", runId: 41 });
    expect(registry.cancel).toHaveBeenCalledWith({
      runId: 41,
      message: "Cancelled by user",
      finishedAt,
    });
    expect(scheduler.cancel).toHaveBeenCalledWith(41);
  });

  it("does not abort an execution that was already terminal", () => {
    const registry = registryReturning({
      status: "already-terminal",
      runId: 41,
      terminalStatus: "completed",
    });
    const scheduler: DiscoveryRunCancellationScheduler = {
      cancel: vi.fn(),
    };
    const discoveryRuns = createDiscoveryRunCanceller({
      registry,
      scheduler,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });

    const result = discoveryRuns.cancelDiscoveryRun({ runId: 41 });

    expect(result).toEqual({
      status: "already-terminal",
      runId: 41,
      terminalStatus: "completed",
    });
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });
});

function registryReturning(result: DiscoveryRunCancellation): Pick<DiscoveryRunRegistry, "cancel"> {
  return {
    cancel: vi.fn(() => result),
  };
}
