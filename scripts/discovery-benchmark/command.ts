import type { DiscoveryBenchmarkCorpus } from "./corpus";
import { runDiscoveryBenchmark } from "./run-discovery-benchmark";

export function evaluateDiscoveryBenchmark(corpus: DiscoveryBenchmarkCorpus) {
  const report = runDiscoveryBenchmark(corpus);
  return {
    report,
    stdout: `${JSON.stringify(report, null, 2)}\n`,
    exitCode: report.passed ? 0 : 1,
  };
}
