import type { SetSourceCoverageEnabledCommand } from "./command";
import type { SourceCoverageStore } from "./port";

interface SetSourceCoverageEnabledDependencies {
  readonly coverage: SourceCoverageStore;
  readonly now: () => Date;
}

export function createSetSourceCoverageEnabled({
  coverage,
  now,
}: SetSourceCoverageEnabledDependencies) {
  return (command: SetSourceCoverageEnabledCommand) => {
    if (command.kind === "source") {
      coverage.setSourceEnabled(command.id, command.enabled);
    } else if (command.kind === "board") {
      coverage.setBoardEnabled(command.id, command.enabled);
    } else {
      coverage.setCompanyBoardRefreshEnabled(command.enabled, now());
    }
    return { status: "changed" as const };
  };
}
