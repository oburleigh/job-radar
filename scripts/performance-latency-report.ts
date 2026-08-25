interface PerformanceLatencyRequest {
  readonly fixture: {
    readonly jobs: number;
    readonly profile: string;
  };
  readonly http: {
    readonly surface: string;
    readonly connections: number;
    readonly requests: number;
    readonly errors: number;
    readonly timeouts: number;
    readonly non2xx: number;
    readonly requestsPerSecond: number;
    readonly latency: HttpPercentiles;
  };
  readonly sqliteSamples: readonly number[];
}

interface HttpPercentiles {
  readonly p50: number;
  readonly p97_5: number;
  readonly p99: number;
}

export function summarizePerformanceLatency(request: PerformanceLatencyRequest) {
  if (request.sqliteSamples.length === 0) {
    throw new Error("A performance report requires at least one SQLite latency sample.");
  }

  const samples = request.sqliteSamples.toSorted((left, right) => left - right);
  return {
    schemaVersion: 1 as const,
    enforcement: "diagnostic" as const,
    fixture: request.fixture,
    http: {
      surface: request.http.surface,
      connections: request.http.connections,
      requests: request.http.requests,
      errors: request.http.errors,
      timeouts: request.http.timeouts,
      non2xx: request.http.non2xx,
      requestsPerSecond: request.http.requestsPerSecond,
      latencyMilliseconds: request.http.latency,
    },
    sqlite: {
      surface: "getDashboardData" as const,
      runs: samples.length,
      samplesMilliseconds: samples,
      latencyMilliseconds: {
        p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
        p99: percentile(samples, 0.99),
      },
    },
  };
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  const index = Math.max(0, Math.ceil(quantile * sortedValues.length) - 1);
  return sortedValues[index] ?? 0;
}
