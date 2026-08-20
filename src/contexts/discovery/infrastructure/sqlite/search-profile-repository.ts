import { eq } from "drizzle-orm";
import type { SearchProfileRepository } from "@/contexts/discovery/application/search-profiles/save/port";
import { type SearchProfileId, searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import type { SearchProfileDefinition } from "@/contexts/discovery/domain/search-profile";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { searchProfiles } from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = typeof db;

export function createSqliteSearchProfileRepository(database: Database): SearchProfileRepository {
  return {
    findIdByName(name) {
      const id = database
        .select({ id: searchProfiles.id })
        .from(searchProfiles)
        .where(eq(searchProfiles.name, name))
        .get()?.id;
      return id === undefined ? undefined : requiredSearchProfileId(id);
    },

    insert(profile, timestamp) {
      const id = database
        .insert(searchProfiles)
        .values(toInsertValues(profile, timestamp))
        .returning({ id: searchProfiles.id })
        .get().id;
      return requiredSearchProfileId(id);
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

function requiredSearchProfileId(value: number): SearchProfileId {
  const id = searchProfileIdFrom(value);
  if (id === null) {
    throw new Error(`SQLite returned an invalid search profile identifier: ${value}`);
  }
  return id;
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
    salaryCurrency: profile.salaryPreference.currency ?? "",
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
