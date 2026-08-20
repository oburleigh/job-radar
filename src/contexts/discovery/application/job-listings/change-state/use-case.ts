import type { ChangeJobListingStateCommand } from "./command";
import type { JobListingStateStore } from "./port";
import type { ChangeJobListingStateResult } from "./result";

interface ChangeJobListingStateDependencies {
  readonly states: JobListingStateStore;
  readonly now: () => Date;
}

export type ChangeJobListingState = (
  command: ChangeJobListingStateCommand,
) => ChangeJobListingStateResult;

export function createChangeJobListingState({
  states,
  now,
}: ChangeJobListingStateDependencies): ChangeJobListingState {
  return (command) => {
    states.save(command, now());
    return { status: "changed" };
  };
}
