import type { DiscoveryBenchmarkCorpus } from "./corpus";
import { runDiscoveryBenchmark } from "./run-discovery-benchmark";

export async function evaluateDiscoveryBenchmark(corpus: DiscoveryBenchmarkCorpus) {
  const report = await runDiscoveryBenchmark(corpus);
  return {
    report,
    stdout: `${JSON.stringify(report, null, 2)}\n`,
    exitCode: report.passed ? 0 : 1,
  };
}
