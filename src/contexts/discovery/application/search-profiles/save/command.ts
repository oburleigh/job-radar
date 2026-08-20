import type { SearchProfileDefinition } from "../../../domain/search-profile";

export interface SaveSearchProfileCommand {
  readonly id: number | undefined;
  readonly profile: SearchProfileDefinition;
}
