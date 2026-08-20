import type { DiscoveryRunFailure, StartDiscoveryRunCommand } from "./discovery-run";

export type DiscoveryRunReservation =
  | { readonly status: "created"; readonly runId: number }
  | { readonly status: "already-running"; readonly runId: number };

export interface DiscoveryRunRegistry {
  reserve(command: StartDiscoveryRunCommand): DiscoveryRunReservation;
  fail(failure: DiscoveryRunFailure): void;
}
