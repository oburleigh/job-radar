import { describe, expect, it } from "vitest";

import { summarizePerformanceLatency } from "./performance-latency-report";

describe("performance latency report", () => {
  it("sorts SQLite samples and reports stable named percentiles beside HTTP load evidence", () => {
    const report = summarizePerformanceLatency({
      fixture: { jobs: 20, profile: "Performance fixture" },
      http: {
        surface: "GET /?profile=1&provider=serper",
        connections: 10,
        requests: 500,
        errors: 0,
        timeouts: 0,
        non2xx: 0,
        requestsPerSecond: 425.5,
        latency: { p50: 18, p97_5: 37, p99: 45 },
      },
      sqliteSamples: [4, 1, 3, 2, 5],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      enforcement: "diagnostic",
      fixture: { jobs: 20, profile: "Performance fixture" },
      http: {
        surface: "GET /?profile=1&provider=serper",
        connections: 10,
        requests: 500,
        errors: 0,
        timeouts: 0,
        non2xx: 0,
        requestsPerSecond: 425.5,
        latencyMilliseconds: { p50: 18, p97_5: 37, p99: 45 },
      },
      sqlite: {
        surface: "getDashboardData",
        runs: 5,
        samplesMilliseconds: [1, 2, 3, 4, 5],
        latencyMilliseconds: { p50: 3, p95: 5, p99: 5 },
      },
    });
  });

  it("rejects an empty SQLite sample set", () => {
    expect(() =>
      summarizePerformanceLatency({
        fixture: { jobs: 20, profile: "Performance fixture" },
        http: {
          surface: "GET /?profile=1&provider=serper",
          connections: 1,
          requests: 1,
          errors: 0,
          timeouts: 0,
          non2xx: 0,
          requestsPerSecond: 1,
          latency: { p50: 1, p97_5: 1, p99: 1 },
        },
        sqliteSamples: [],
      }),
    ).toThrow("at least one SQLite latency sample");
  });
});
