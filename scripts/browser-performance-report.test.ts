import { describe, expect, it } from "vitest";

import { summarizeBrowserPerformance, type WebVitalsSample } from "./browser-performance-report";

const thresholds = {
  CLS: 0.1,
  INP: 200,
  LCP: 2_500,
} as const;

describe("browser performance report", () => {
  it("reports median Web Vitals against their named budgets", () => {
    const report = summarizeBrowserPerformance({
      route: "/",
      samples: [
        sample({ CLS: 0.04, INP: 130, LCP: 1_800 }),
        sample({ CLS: 0.02, INP: 90, LCP: 1_500 }),
        sample({ CLS: 0.03, INP: 110, LCP: 1_700 }),
      ],
      thresholds,
    });

    expect(report).toEqual({
      schemaVersion: 1,
      route: "/",
      runs: 3,
      passed: true,
      failingMetrics: [],
      metrics: {
        CLS: {
          aggregation: "median",
          unit: "score",
          values: [0.02, 0.03, 0.04],
          median: 0.03,
          threshold: 0.1,
          passed: true,
        },
        INP: {
          aggregation: "median",
          unit: "milliseconds",
          values: [90, 110, 130],
          median: 110,
          threshold: 200,
          passed: true,
        },
        LCP: {
          aggregation: "median",
          unit: "milliseconds",
          values: [1_500, 1_700, 1_800],
          median: 1_700,
          threshold: 2_500,
          passed: true,
        },
      },
    });
  });

  it("passes an exact threshold and names every metric above its budget", () => {
    const report = summarizeBrowserPerformance({
      route: "/",
      samples: [
        sample({ CLS: 0.1, INP: 201, LCP: 2_501 }),
        sample({ CLS: 0.1, INP: 210, LCP: 2_600 }),
        sample({ CLS: 0.1, INP: 220, LCP: 2_700 }),
      ],
      thresholds,
    });

    expect(report.passed).toBe(false);
    expect(report.failingMetrics).toEqual(["INP", "LCP"]);
    expect(report.metrics.CLS).toMatchObject({ median: 0.1, passed: true });
    expect(report.metrics.INP).toMatchObject({ median: 210, passed: false });
    expect(report.metrics.LCP).toMatchObject({ median: 2_600, passed: false });
  });

  it("uses the mean of the two middle samples for an even-sized run set", () => {
    const report = summarizeBrowserPerformance({
      route: "/",
      samples: [
        sample({ CLS: 0.02, INP: 80, LCP: 1_200 }),
        sample({ CLS: 0.04, INP: 120, LCP: 1_800 }),
      ],
      thresholds,
    });

    expect(report.metrics.CLS.median).toBe(0.03);
    expect(report.metrics.INP.median).toBe(100);
    expect(report.metrics.LCP.median).toBe(1_500);
  });

  it("rejects a report without any browser samples", () => {
    expect(() => summarizeBrowserPerformance({ route: "/", samples: [], thresholds })).toThrow(
      "at least one sample",
    );
  });
});

function sample(values: WebVitalsSample): WebVitalsSample {
  return values;
}
