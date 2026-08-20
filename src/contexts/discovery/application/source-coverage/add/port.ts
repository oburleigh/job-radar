import type { AddJobSourceCommand } from "./command";
import type { AddJobSourceResult } from "./result";

export interface JobSourceRegistrar {
  register(command: AddJobSourceCommand, discoveredAt: Date): AddJobSourceResult;
}
