import "server-only";

import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { searchProfiles } from "@/contexts/discovery/adapters/driven/sqlite/schema";

export function getProfiles() {
  return db
    .select({
      id: searchProfiles.id,
      name: searchProfiles.name,
      enabled: searchProfiles.enabled,
      titleTerms: searchProfiles.titleTerms,
      locationTerms: searchProfiles.locationTerms,
      requiredJobTerms: searchProfiles.requiredJobTerms,
      excludedTitleTerms: searchProfiles.excludedTitleTerms,
      excludedLocationTerms: searchProfiles.excludedLocationTerms,
      excludedDescriptionTerms: searchProfiles.excludedDescriptionTerms,
      includeRemote: searchProfiles.includeRemote,
      includeUnverified: searchProfiles.includeUnverified,
      salaryCurrency: searchProfiles.salaryCurrency,
      salaryMin: searchProfiles.salaryMin,
      salaryMax: searchProfiles.salaryMax,
      maxAgeDays: searchProfiles.maxAgeDays,
      minScore: searchProfiles.minScore,
      updatedAt: searchProfiles.updatedAt,
    })
    .from(searchProfiles)
    .orderBy(searchProfiles.name)
    .all();
}
