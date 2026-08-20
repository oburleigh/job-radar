import type { SetSourceCoverageEnabledCommand } from "./command";
import type { SourceCoverageStore } from "./port";

interface SetSourceCoverageEnabledDependencies {
  readonly coverage: SourceCoverageStore;
}

export function createSetSourceCoverageEnabled({ coverage }: SetSourceCoverageEnabledDependencies) {
  return (command: SetSourceCoverageEnabledCommand) => {
    if (command.kind === "source") {
      coverage.setSourceEnabled(command.id, command.enabled);
    } else {
      coverage.setBoardEnabled(command.id, command.enabled);
    }
    return { status: "changed" as const };
  };
}
