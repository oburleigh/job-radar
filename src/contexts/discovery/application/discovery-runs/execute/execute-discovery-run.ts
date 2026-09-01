import type { ForDiscoveringJobs } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import type { DiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";

export type ExecuteDiscoveryRunResult =
  | { readonly status: "completed" }
  | { readonly status: "partial"; readonly message: string }
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
        const summary = await discovery.discoverJobs(execution);
        if (execution.signal?.aborted) {
          return { status: "cancelled" };
        }
        if (summary.providerFailure) {
          const { provider, classification, code, attempts, skippedQueries } =
            summary.providerFailure;
          const successfulItems =
            summary.knownBoardSuccesses + summary.queries - summary.queryErrors;
          const message = `${provider} ${classification} ${code} after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}; skipped ${skippedQueries} ${skippedQueries === 1 ? "query" : "queries"}`;
          return {
            status: successfulItems > 0 ? "partial" : "failed",
            message,
          };
        }
        const failedItems = summary.queryErrors + summary.syncErrors;
        if (failedItems > 0) {
          const successfulItems =
            summary.knownBoardSuccesses + summary.queries - summary.queryErrors;
          const message = [
            summary.syncErrors > 0
              ? `${summary.syncErrors} known board synchronization${summary.syncErrors === 1 ? "" : "s"} failed`
              : "",
            summary.queryErrors > 0
              ? `${summary.queryErrors} web coverage request${summary.queryErrors === 1 ? "" : "s"} failed`
              : "",
          ]
            .filter(Boolean)
            .join("; ");
          return {
            status: successfulItems > 0 ? "partial" : "failed",
            message,
          };
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
