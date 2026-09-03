import { describe, expect, it } from "vitest";

import { resolveDiscoveryRunProgress, STALE_DISCOVERY_RUN_CODE } from "./stale-discovery-run";

const now = new Date("2026-09-03T12:00:00.000Z");
const staleAfterMs = 300_000;
const policy = { now, staleAfterMs } as const;

function at(msBeforeNow: number): Date {
  return new Date(now.getTime() - msBeforeNow);
}

describe("resolveDiscoveryRunProgress", () => {
  it("fails a running run whose last heartbeat is older than the stale timeout", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(900_000),
          heartbeatAt: at(300_001),
        },
        policy,
      ),
    ).toEqual({ status: "failed", error: STALE_DISCOVERY_RUN_CODE });
  });

  it("leaves a running run whose heartbeat is inside the stale timeout alone", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(900_000),
          heartbeatAt: at(1_000),
        },
        policy,
      ),
    ).toEqual({ status: "running", error: "" });
  });

  it("measures from the heartbeat rather than the start for a long run still reporting", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(86_400_000),
          heartbeatAt: at(5_000),
        },
        policy,
      ).status,
    ).toBe("running");
  });

  it("measures from the start when a run has never reported a heartbeat", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(300_001),
          heartbeatAt: null,
        },
        policy,
      ),
    ).toEqual({ status: "failed", error: STALE_DISCOVERY_RUN_CODE });
  });

  it("leaves a just-started run with no heartbeat alone", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(1_000),
          heartbeatAt: null,
        },
        policy,
      ).status,
    ).toBe("running");
  });

  it("treats a heartbeat exactly at the cutoff as still reporting, as the persisted reap does", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "running",
          error: "",
          startedAt: at(900_000),
          heartbeatAt: at(staleAfterMs),
        },
        policy,
      ).status,
    ).toBe("running");
  });

  it.each(["completed", "cancelled"] as const)(
    "never reopens a %s run whose heartbeat is ancient",
    (status) => {
      expect(
        resolveDiscoveryRunProgress(
          {
            status,
            error: "",
            startedAt: at(86_400_000),
            heartbeatAt: at(86_000_000),
          },
          policy,
        ),
      ).toEqual({ status, error: "" });
    },
  );

  it("keeps a failed run's own error rather than relabelling it stale", () => {
    expect(
      resolveDiscoveryRunProgress(
        {
          status: "failed",
          error: "serper fatal credit-exhausted after 1 attempt; skipped 369 queries",
          startedAt: at(86_400_000),
          heartbeatAt: at(86_000_000),
        },
        policy,
      ),
    ).toEqual({
      status: "failed",
      error: "serper fatal credit-exhausted after 1 attempt; skipped 369 queries",
    });
  });
});
