import { describe, expect, it, vi } from "vitest";

import type { ForStartingDiscoveryRuns } from "../../../hexagon/application/start-discovery-run";
import { createStartDiscoveryRunRoute } from "./start-discovery-run-route";

describe("start discovery run web route", () => {
  it("returns an accepted response for a newly started run", async () => {
    const startDiscoveryRun = vi.fn(() => ({ status: "started" as const, runId: 41 }));
    const post = createStartDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      isProviderConfigured: (name) => name === "serper",
      assertProviderReady: vi.fn(),
      discoveryRuns: { startDiscoveryRun },
    });

    const response = await post(discoveryRequest({ profileId: 7, provider: "serper" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      runId: 41,
      alreadyRunning: false,
      message: "Discovery #41 is running in the background. You can keep using the app.",
    });
    expect(startDiscoveryRun).toHaveBeenCalledWith({ profileId: 7, providerName: "serper" });
  });

  it("returns the active run without claiming to start another", async () => {
    const discoveryRuns: ForStartingDiscoveryRuns = {
      startDiscoveryRun: () => ({ status: "already-running", runId: 29 }),
    };
    const post = createStartDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      isProviderConfigured: (name) => name === "serper",
      assertProviderReady: vi.fn(),
      discoveryRuns,
    });

    const response = await post(discoveryRequest({ profileId: 7, provider: "serper" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      runId: 29,
      alreadyRunning: true,
      message: "Discovery #29 is already running for this profile.",
    });
  });

  it("rejects invalid input before invoking the application", async () => {
    const startDiscoveryRun = vi.fn();
    const post = createStartDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      isProviderConfigured: (name) => name === "serper",
      assertProviderReady: vi.fn(),
      discoveryRuns: { startDiscoveryRun },
    });

    const response = await post(discoveryRequest({ profileId: 7, provider: "unknown" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Invalid discovery request.",
    });
    expect(startDiscoveryRun).not.toHaveBeenCalled();
  });

  it("reports provider setup errors before reserving a run", async () => {
    const startDiscoveryRun = vi.fn();
    const post = createStartDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      isProviderConfigured: () => true,
      assertProviderReady: () => {
        throw new Error("Serper.dev API key is not configured");
      },
      discoveryRuns: { startDiscoveryRun },
    });

    const response = await post(discoveryRequest({ profileId: 7, provider: "serper" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Serper.dev API key is not configured",
    });
    expect(startDiscoveryRun).not.toHaveBeenCalled();
  });

  it("translates application failures into the existing error response", async () => {
    const post = createStartDiscoveryRunRoute({
      assertLocalRequest: vi.fn(),
      isProviderConfigured: () => true,
      assertProviderReady: vi.fn(),
      discoveryRuns: {
        startDiscoveryRun: () => {
          throw new Error("Search profile 99 was not found");
        },
      },
    });

    const response = await post(discoveryRequest({ profileId: 99, provider: "serper" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Search profile 99 was not found",
    });
  });
});

function discoveryRequest(body: unknown): Request {
  return new Request("http://localhost/api/discovery-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  });
}
