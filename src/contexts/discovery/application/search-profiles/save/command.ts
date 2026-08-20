import type { SearchProfileId } from "@/contexts/discovery/domain/identifiers";
import type { SearchProfileDefinition } from "@/contexts/discovery/domain/search-profile";

export interface SaveSearchProfileCommand {
  readonly id: SearchProfileId | undefined;
  readonly profile: SearchProfileDefinition;
}
