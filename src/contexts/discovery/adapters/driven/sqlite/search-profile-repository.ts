import { eq } from "drizzle-orm";
import type { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { searchProfiles } from "@/contexts/discovery/adapters/driven/sqlite/schema";

import type { SearchProfileRepository } from "../../../hexagon/application/save-search-profile";
import type { SearchProfileDefinition } from "../../../hexagon/domain/search-profile";

type Database = typeof db;

export function createSqliteSearchProfileRepository(database: Database): SearchProfileRepository {
  return {
    findIdByName(name) {
      return database
        .select({ id: searchProfiles.id })
        .from(searchProfiles)
        .where(eq(searchProfiles.name, name))
        .get()?.id;
    },

    insert(profile, timestamp) {
      return database
        .insert(searchProfiles)
        .values(toInsertValues(profile, timestamp))
        .returning({ id: searchProfiles.id })
        .get().id;
    },

    update(id, profile, timestamp) {
      database
        .update(searchProfiles)
        .set(toUpdateValues(profile, timestamp))
        .where(eq(searchProfiles.id, id))
        .run();
    },
  };
}

function toUpdateValues(profile: SearchProfileDefinition, timestamp: Date) {
  return {
    name: profile.name,
    titleTerms: [...profile.targetTitles],
    locationTerms: [...profile.targetLocations],
    requiredJobTerms: [...profile.requiredJobTerms],
    excludedTitleTerms: [...profile.excludedTitleTerms],
    excludedLocationTerms: [...profile.excludedLocationTerms],
    excludedDescriptionTerms: [...profile.excludedDescriptionTerms],
    includeRemote: profile.includeRemote,
    includeUnverified: profile.includeUnverified,
    salaryCurrency: profile.salaryPreference.currency,
    salaryMin: profile.salaryPreference.minimumAnnual,
    salaryMax: profile.salaryPreference.maximumAnnual,
    maxAgeDays: profile.maximumAgeDays,
    minScore: profile.minimumScore,
    updatedAt: timestamp,
  };
}

function toInsertValues(profile: SearchProfileDefinition, timestamp: Date) {
  return {
    ...toUpdateValues(profile, timestamp),
    enabled: true,
    createdAt: timestamp,
  };
}
