import type { DiscoveryRunFailure, StartDiscoveryRunCommand } from "./discovery-run";

export type DiscoveryRunReservation =
  | { readonly status: "created"; readonly runId: number }
  | { readonly status: "already-running"; readonly runId: number };

export type DiscoveryRunCancellation =
  | { readonly status: "cancelled"; readonly runId: number }
  | {
      readonly status: "already-terminal";
      readonly runId: number;
      readonly terminalStatus: "completed" | "failed" | "cancelled";
    }
  | { readonly status: "not-found"; readonly runId: number };

export type CancelDiscoveryRunCommand = {
  readonly runId: number;
  readonly message: string;
  readonly finishedAt: Date;
};

export interface DiscoveryRunRegistry {
  reserve(command: StartDiscoveryRunCommand): DiscoveryRunReservation;
  cancel(command: CancelDiscoveryRunCommand): DiscoveryRunCancellation;
  fail(failure: DiscoveryRunFailure): void;
}
