import type { SearchProfileId } from "@/contexts/discovery/domain/identifiers";
import type { SearchProfileDefinition } from "@/contexts/discovery/domain/search-profile";

export interface SearchProfileRepository {
  findIdByName(name: string): SearchProfileId | undefined;
  insert(profile: SearchProfileDefinition, timestamp: Date): SearchProfileId;
  update(id: SearchProfileId, profile: SearchProfileDefinition, timestamp: Date): void;
}
