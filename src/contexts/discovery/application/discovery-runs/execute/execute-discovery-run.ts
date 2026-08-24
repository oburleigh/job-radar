import type { ForDiscoveringJobs } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import type { DiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";

export type ExecuteDiscoveryRunResult =
  | { readonly status: "completed" }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly message: string };

export interface ForExecutingDiscoveryRuns {
  executeDiscoveryRun(execution: DiscoveryRunExecution): Promise<ExecuteDiscoveryRunResult>;
}

type DiscoveryRunExecutionDependencies = {
  readonly discovery: ForDiscoveringJobs;
};

export function createDiscoveryRunExecution({
  discovery,
}: DiscoveryRunExecutionDependencies): ForExecutingDiscoveryRuns {
  return {
    async executeDiscoveryRun(execution) {
      if (execution.signal?.aborted) {
        return { status: "cancelled" };
      }
      try {
        await discovery.discoverJobs(execution);
        if (execution.signal?.aborted) {
          return { status: "cancelled" };
        }
        return { status: "completed" };
      } catch (error) {
        if (execution.signal?.aborted) {
          return { status: "cancelled" };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { status: "failed", message };
      }
    },
  };
}
