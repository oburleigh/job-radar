import type { SaveSearchProfileCommand } from "./command";
import type { SearchProfileRepository } from "./port";
import type { SaveSearchProfileResult } from "./result";

export type SaveSearchProfile = (command: SaveSearchProfileCommand) => SaveSearchProfileResult;

interface SaveSearchProfileDependencies {
  readonly profiles: SearchProfileRepository;
  readonly now: () => Date;
}

export function createSaveSearchProfile({
  profiles,
  now,
}: SaveSearchProfileDependencies): SaveSearchProfile {
  return (command) => {
    const duplicateId = profiles.findIdByName(command.profile.name);
    if (duplicateId !== undefined && duplicateId !== command.id) {
      return { status: "duplicate-name" };
    }

    const timestamp = now();
    if (command.id !== undefined) {
      profiles.update(command.id, command.profile, timestamp);
      return { status: "saved", id: command.id, created: false };
    }

    const id = profiles.insert(command.profile, timestamp);
    return { status: "saved", id, created: true };
  };
}
