import { evaluateDiscoveryBenchmark } from "./discovery-benchmark/command";
import { discoveryBenchmarkCorpus } from "./discovery-benchmark/corpus";

const result = evaluateDiscoveryBenchmark(discoveryBenchmarkCorpus);
process.stdout.write(result.stdout);
process.exitCode = result.exitCode;
