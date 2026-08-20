import { eq, ne } from "drizzle-orm";

import type { SearchProfileCatalog } from "../../application/search-profiles/delete/port";
import type { db } from "./database";
import { searchProfiles } from "./schema";

type Database = typeof db;

export function createSqliteSearchProfileCatalog(database: Database): SearchProfileCatalog {
  return {
    exists(profileId) {
      return Boolean(
        database
          .select({ id: searchProfiles.id })
          .from(searchProfiles)
          .where(eq(searchProfiles.id, profileId))
          .get(),
      );
    },
    findNextProfileId(excludingProfileId) {
      return (
        database
          .select({ id: searchProfiles.id })
          .from(searchProfiles)
          .where(ne(searchProfiles.id, excludingProfileId))
          .orderBy(searchProfiles.name)
          .limit(1)
          .get()?.id ?? null
      );
    },
    delete(profileId) {
      database.delete(searchProfiles).where(eq(searchProfiles.id, profileId)).run();
    },
  };
}
