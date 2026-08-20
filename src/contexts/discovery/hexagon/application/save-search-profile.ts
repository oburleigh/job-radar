import type { SearchProfileDefinition } from "../domain/search-profile";

export interface SearchProfileRepository {
  findIdByName(name: string): number | undefined;
  insert(profile: SearchProfileDefinition, timestamp: Date): number;
  update(id: number, profile: SearchProfileDefinition, timestamp: Date): void;
}

export type SaveSearchProfileCommand = {
  readonly id: number | undefined;
  readonly profile: SearchProfileDefinition;
};

export type SaveSearchProfileResult =
  | { readonly status: "duplicate-name" }
  | { readonly status: "saved"; readonly id: number; readonly created: boolean };

export type SaveSearchProfile = (command: SaveSearchProfileCommand) => SaveSearchProfileResult;

type SaveSearchProfileDependencies = {
  readonly profiles: SearchProfileRepository;
  readonly now: () => Date;
};

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
