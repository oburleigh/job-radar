import type { SaveAtsIntegrationCommand } from "./command";

export interface AtsIntegrationRegistry {
  isBuiltIn(atsType: string): boolean;
  exists(atsType: string): boolean;
  findPatternConflict(
    atsType: string,
    patterns: readonly string[],
  ): { readonly pattern: string; readonly owner: string } | null;
  save(command: SaveAtsIntegrationCommand, changedAt: Date): void;
}
