import type { DeleteSearchProfileCommand } from "./command";
import type { SearchProfileCatalog } from "./port";
import type { DeleteSearchProfileResult } from "./result";

interface DeleteSearchProfileDependencies {
  readonly profiles: SearchProfileCatalog;
}

export function createDeleteSearchProfile({ profiles }: DeleteSearchProfileDependencies) {
  return (command: DeleteSearchProfileCommand): DeleteSearchProfileResult => {
    if (!profiles.exists(command.profileId)) {
      return { status: "not-found" };
    }
    const nextProfileId = profiles.findNextProfileId(command.profileId);
    profiles.delete(command.profileId);
    return { status: "deleted", nextProfileId };
  };
}
