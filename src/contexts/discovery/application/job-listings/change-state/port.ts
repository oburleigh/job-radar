import type { ChangeJobListingStateCommand } from "./command";

export interface JobListingStateStore {
  save(command: ChangeJobListingStateCommand, changedAt: Date): void;
}
