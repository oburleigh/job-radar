import type {
  DiscoveryRunExecution,
  StartDiscoveryRunCommand,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import type { DiscoveryRunRegistry } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";

export interface DiscoveryRunScheduler {
  schedule(execution: DiscoveryRunExecution): void;
}

export type StartDiscoveryRunResult =
  | { readonly status: "started"; readonly runId: number }
  | { readonly status: "already-running"; readonly runId: number };

export interface ForStartingDiscoveryRuns {
  startDiscoveryRun(command: StartDiscoveryRunCommand): StartDiscoveryRunResult;
}

type DiscoveryRunStarterDependencies = {
  readonly registry: DiscoveryRunRegistry;
  readonly scheduler: DiscoveryRunScheduler;
};

export function createDiscoveryRunStarter({
  registry,
  scheduler,
}: DiscoveryRunStarterDependencies): ForStartingDiscoveryRuns {
  return {
    startDiscoveryRun(command) {
      const reservation = registry.reserve(command);
      if (reservation.status === "already-running") {
        return reservation;
      }

      scheduler.schedule({ ...command, runId: reservation.runId });
      return { status: "started", runId: reservation.runId };
    },
  };
}
