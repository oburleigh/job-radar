import type { ForDiscoveringJobs } from "./discover-jobs";
import type { DiscoveryRunExecution } from "./discovery-run";

export type ExecuteDiscoveryRunResult =
  | { readonly status: "completed" }
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
      try {
        await discovery.discoverJobs(execution);
        return { status: "completed" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: "failed", message };
      }
    },
  };
}
