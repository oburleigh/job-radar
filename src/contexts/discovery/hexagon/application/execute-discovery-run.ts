import type { DiscoveryRunExecution } from "./discovery-run";
import type { DiscoveryRunRegistry } from "./discovery-run-registry";

export interface DiscoverySearch {
  execute(execution: DiscoveryRunExecution): Promise<void>;
}

export type ExecuteDiscoveryRunResult =
  | { readonly status: "completed" }
  | { readonly status: "failed"; readonly message: string };

export interface ForExecutingDiscoveryRuns {
  executeDiscoveryRun(execution: DiscoveryRunExecution): Promise<ExecuteDiscoveryRunResult>;
}

type DiscoveryRunExecutionDependencies = {
  readonly search: DiscoverySearch;
  readonly registry: DiscoveryRunRegistry;
  readonly now: () => Date;
};

export function createDiscoveryRunExecution({
  search,
  registry,
  now,
}: DiscoveryRunExecutionDependencies): ForExecutingDiscoveryRuns {
  return {
    async executeDiscoveryRun(execution) {
      try {
        await search.execute(execution);
        return { status: "completed" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        registry.fail({ runId: execution.runId, message, finishedAt: now() });
        return { status: "failed", message };
      }
    },
  };
}
