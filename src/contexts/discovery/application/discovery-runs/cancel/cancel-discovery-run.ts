import type {
  CancelDiscoveryRunCommand,
  DiscoveryRunCancellation,
  DiscoveryRunRegistry,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";

export interface DiscoveryRunCancellationScheduler {
  cancel(runId: number): void;
}

export type CancelDiscoveryRunRequest = {
  readonly runId: number;
  readonly message?: string;
};

export interface ForCancellingDiscoveryRuns {
  cancelDiscoveryRun(request: CancelDiscoveryRunRequest): DiscoveryRunCancellation;
}

type DiscoveryRunCancellerDependencies = {
  readonly registry: Pick<DiscoveryRunRegistry, "cancel">;
  readonly scheduler: DiscoveryRunCancellationScheduler;
  readonly now: () => Date;
};

export function createDiscoveryRunCanceller({
  registry,
  scheduler,
  now,
}: DiscoveryRunCancellerDependencies): ForCancellingDiscoveryRuns {
  return {
    cancelDiscoveryRun(request) {
      const command: CancelDiscoveryRunCommand = {
        runId: request.runId,
        message: request.message ?? "Cancelled by user",
        finishedAt: now(),
      };
      const result = registry.cancel(command);
      if (result.status === "cancelled") {
        scheduler.cancel(result.runId);
      }
      return result;
    },
  };
}
