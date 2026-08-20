import type { SaveAtsIntegrationCommand } from "./command";
import type { AtsIntegrationRegistry } from "./port";
import type { SaveAtsIntegrationResult } from "./result";

interface SaveAtsIntegrationDependencies {
  readonly integrations: AtsIntegrationRegistry;
  readonly now: () => Date;
}

export function createSaveAtsIntegration({ integrations, now }: SaveAtsIntegrationDependencies) {
  return (command: SaveAtsIntegrationCommand): SaveAtsIntegrationResult => {
    const builtIn = integrations.isBuiltIn(command.atsType);
    if (!builtIn && command.supportsBoardSync) {
      return { status: "rejected", reason: "custom-sync-not-supported" };
    }
    const exists = integrations.exists(command.atsType);
    if (command.isNew && exists) {
      return { status: "rejected", reason: "already-exists" };
    }
    if (!command.isNew && !exists) {
      return { status: "rejected", reason: "not-found" };
    }
    const conflict = integrations.findPatternConflict(command.atsType, command.searchPatterns);
    if (conflict) {
      return { status: "rejected", reason: "pattern-conflict", ...conflict };
    }
    if (!builtIn && command.hostnames.length === 0 && command.hostSuffixes.length === 0) {
      return { status: "rejected", reason: "missing-host-rule" };
    }

    integrations.save(
      {
        ...command,
        supportsBoardSync: builtIn && command.supportsBoardSync,
        endpoints: builtIn ? command.endpoints : {},
      },
      now(),
    );
    return {
      status: "saved",
      atsType: command.atsType,
      label: command.label,
      created: command.isNew,
    };
  };
}
