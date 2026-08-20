import type { ForExecutingDiscoveryRuns } from "../../application/discovery-runs/execute/execute-discovery-run";
import type { DiscoveryRunScheduler } from "../../application/discovery-runs/start/start-discovery-run";

type AfterResponse = (callback: () => Promise<void>) => void;

type AfterResponseDiscoveryRunSchedulerDependencies = {
  readonly afterResponse: AfterResponse;
  readonly discoveryRuns: ForExecutingDiscoveryRuns;
  readonly reportFailure: (message: string) => void;
};

export function createAfterResponseDiscoveryRunScheduler({
  afterResponse,
  discoveryRuns,
  reportFailure,
}: AfterResponseDiscoveryRunSchedulerDependencies): DiscoveryRunScheduler {
  return {
    schedule(execution) {
      afterResponse(async () => {
        const result = await discoveryRuns.executeDiscoveryRun(execution);
        if (result.status === "failed") {
          reportFailure(`Discovery run ${execution.runId} failed: ${result.message}`);
        }
      });
    },
  };
}
