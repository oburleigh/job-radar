import type { SearchProfileDefinition } from "../../../domain/search-profile";

export interface SearchProfileRepository {
  findIdByName(name: string): number | undefined;
  insert(profile: SearchProfileDefinition, timestamp: Date): number;
  update(id: number, profile: SearchProfileDefinition, timestamp: Date): void;
}
