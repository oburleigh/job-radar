import type { AddJobSourceCommand } from "./command";
import type { JobSourceRegistrar } from "./port";

interface AddJobSourceDependencies {
  readonly sources: JobSourceRegistrar;
  readonly now: () => Date;
}

export function createAddJobSource({ sources, now }: AddJobSourceDependencies) {
  return (command: AddJobSourceCommand) => sources.register(command, now());
}
