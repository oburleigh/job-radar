import { describe, expect, it, vi } from "vitest";

import type { ForCancellingDiscoveryRuns } from "@/contexts/discovery/application/discovery-runs/cancel/cancel-discovery-run";
import { createCancelDiscoveryRunRoute } from "./cancel-discovery-run";

describe("cancel discovery run web route", () => {
  it("authenticates and returns the persisted cancellation", async () => {
    const cancelDiscoveryRun = vi.fn(() => ({ status: "cancelled" as const, runId: 41 }));
    const assertLocalRequest = vi.fn();
    const cancel = createCancelDiscoveryRunRoute({
      assertLocalRequest,
      discoveryRuns: { cancelDiscoveryRun },
    });

    const response = await cancel(cancelRequest({ runId: 41 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "cancelled",
      runId: 41,
      message: "Discovery #41 was cancelled.",
    });
    expect(assertLocalRequest).toHaveBeenCalledOnce();
    expect(cancelDiscoveryRun).toHaveBeenCalledWith({ runId: 41 });
  });

  it("returns terminal and missing outcomes without hiding their distinction", async () => {
    const outcomes: ForCancellingDiscoveryRuns = {
      cancelDiscoveryRun: ({ runId }) =>
        runId === 41
          ? { status: "already-terminal", runId, terminalStatus: "completed" }
          : { status: "not-found", runId },
    };
    const cancel = createCancelDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      discoveryRuns: outcomes,
    });

    const terminalResponse = await cancel(cancelRequest({ runId: 41 }));
    expect(terminalResponse.status).toBe(200);
    expect(await terminalResponse.json()).toEqual({
      ok: true,
      status: "already-terminal",
      runId: 41,
      terminalStatus: "completed",
      message: "Discovery #41 is already completed.",
    });

    const missingResponse = await cancel(cancelRequest({ runId: 99 }));
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({
      ok: false,
      status: "not-found",
      runId: 99,
      message: "Discovery run not found.",
    });
  });

  it("rejects malformed run ids before invoking the application", async () => {
    const cancelDiscoveryRun = vi.fn();
    const cancel = createCancelDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      discoveryRuns: { cancelDiscoveryRun },
    });

    const response = await cancel(cancelRequest({ runId: "41" }));

    expect(response.status).toBe(400);
    expect(cancelDiscoveryRun).not.toHaveBeenCalled();
  });
});

function cancelRequest(body: unknown): Request {
  return new Request("http://localhost/api/discovery-runs", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  });
}
