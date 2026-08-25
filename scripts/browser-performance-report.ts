export interface WebVitalsSample {
  readonly CLS: number;
  readonly INP: number;
  readonly LCP: number;
}

type MetricName = keyof WebVitalsSample;

interface BrowserPerformanceRequest {
  readonly route: string;
  readonly samples: readonly WebVitalsSample[];
  readonly thresholds: Readonly<Record<MetricName, number>>;
}

const units: Readonly<Record<MetricName, "milliseconds" | "score">> = {
  CLS: "score",
  INP: "milliseconds",
  LCP: "milliseconds",
};

const metricNames = ["CLS", "INP", "LCP"] as const;

export function summarizeBrowserPerformance(request: BrowserPerformanceRequest) {
  const metrics = {
    CLS: summarizeMetric("CLS", request),
    INP: summarizeMetric("INP", request),
    LCP: summarizeMetric("LCP", request),
  };
  const failingMetrics = metricNames.filter((name) => !metrics[name].passed);

  return {
    schemaVersion: 1 as const,
    route: request.route,
    runs: request.samples.length,
    passed: failingMetrics.length === 0,
    failingMetrics,
    metrics,
  };
}

function summarizeMetric(name: MetricName, request: BrowserPerformanceRequest) {
  const values = request.samples
    .map((sample) => sample[name])
    .toSorted((left, right) => left - right);
  const medianValue = median(values);
  return {
    aggregation: "median" as const,
    unit: units[name],
    values,
    median: medianValue,
    threshold: request.thresholds[name],
    passed: medianValue <= request.thresholds[name],
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("A browser performance report requires at least one sample.");
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[middle] ?? 0;
  }
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}
