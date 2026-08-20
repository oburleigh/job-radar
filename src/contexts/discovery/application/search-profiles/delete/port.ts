export interface SearchProfileCatalog {
  exists(profileId: number): boolean;
  findNextProfileId(excludingProfileId: number): number | null;
  delete(profileId: number): void;
}
