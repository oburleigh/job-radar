import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RecruiterDirectoryStore } from "@/contexts/recruiter-engagement/application/directory/port";
import { createEmptyRecruiterDirectory } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import { parsePersistedRecruiterDirectory } from "./persistence-schema";
import { recruiterDirectoryState } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export function createSqliteRecruiterDirectoryStore<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now: () => Date = () => new Date(),
): RecruiterDirectoryStore {
  return {
    async load() {
      const row = database
        .select({ payload: recruiterDirectoryState.payload })
        .from(recruiterDirectoryState)
        .where(eq(recruiterDirectoryState.key, "default"))
        .get();
      return row ? parsePersistedRecruiterDirectory(row.payload) : createEmptyRecruiterDirectory();
    },
    async save(directory) {
      database
        .insert(recruiterDirectoryState)
        .values({ key: "default", payload: directory, updatedAt: now() })
        .onConflictDoUpdate({
          target: recruiterDirectoryState.key,
          set: { payload: directory, updatedAt: now() },
        })
        .run();
    },
  };
}
