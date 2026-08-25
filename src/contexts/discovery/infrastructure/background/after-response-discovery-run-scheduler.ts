import type { ForExecutingDiscoveryRuns } from "@/contexts/discovery/application/discovery-runs/execute/execute-discovery-run";
import type { DiscoveryRunScheduler } from "@/contexts/discovery/application/discovery-runs/start/start-discovery-run";

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
  const controllers = new Map<number, AbortController>();

  return {
    schedule(execution) {
      const controller = new AbortController();
      controllers.set(execution.runId, controller);
      afterResponse(async () => {
        try {
          const result = await discoveryRuns.executeDiscoveryRun({
            ...execution,
            signal: controller.signal,
          });
          if (result.status === "failed") {
            reportFailure(`Discovery run ${execution.runId} failed: ${result.message}`);
          } else if (result.status === "partial") {
            reportFailure(
              `Discovery run ${execution.runId} partially completed: ${result.message}`,
            );
          }
        } finally {
          controllers.delete(execution.runId);
        }
      });
    },
    cancel(runId) {
      controllers.get(runId)?.abort(new DOMException("Cancelled by user", "AbortError"));
    },
  };
}
