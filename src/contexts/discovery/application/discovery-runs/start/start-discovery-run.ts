import type {
  DiscoveryRunExecution,
  StartDiscoveryRunCommand,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import type { DiscoveryRunRegistry } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-registry";
import type { ForPlanningDiscoveryRunWork } from "./plan-discovery-run-work";

export interface DiscoveryRunScheduler {
  schedule(execution: DiscoveryRunExecution): void;
  cancel(runId: number): void;
}

export type StartDiscoveryRunResult =
  | { readonly status: "started"; readonly runId: number }
  | { readonly status: "already-running"; readonly runId: number }
  | { readonly status: "not-runnable" };

export interface ForStartingDiscoveryRuns {
  startDiscoveryRun(command: StartDiscoveryRunCommand): StartDiscoveryRunResult;
}

type DiscoveryRunStarterDependencies = {
  readonly work: ForPlanningDiscoveryRunWork;
  readonly registry: DiscoveryRunRegistry;
  readonly scheduler: DiscoveryRunScheduler;
};

export function createDiscoveryRunStarter({
  work,
  registry,
  scheduler,
}: DiscoveryRunStarterDependencies): ForStartingDiscoveryRuns {
  return {
    startDiscoveryRun(command) {
      const planned = work.plan(command);
      if (planned.knownBoardCount === 0 && planned.webRequestCount === 0) {
        return { status: "not-runnable" };
      }
      const reservation = registry.reserve(command);
      if (reservation.status === "already-running") {
        return reservation;
      }

      scheduler.schedule({ ...command, runId: reservation.runId });
      return { status: "started", runId: reservation.runId };
    },
  };
}
