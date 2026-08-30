import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ShortlistStore } from "@/contexts/recruiter-engagement/application/shortlists/port";
import type { Shortlist } from "@/contexts/recruiter-engagement/domain/shortlist";
import { parsePersistedShortlist } from "./persistence-schema";
import { recruiterShortlists } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export function createSqliteShortlistStore<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now: () => Date = () => new Date(),
): ShortlistStore {
  return {
    async delete(shortlistId) {
      database.delete(recruiterShortlists).where(eq(recruiterShortlists.id, shortlistId)).run();
    },
    async get(shortlistId) {
      const row = database
        .select({ id: recruiterShortlists.id, payload: recruiterShortlists.payload })
        .from(recruiterShortlists)
        .where(eq(recruiterShortlists.id, shortlistId))
        .get();
      return row ? parseShortlistRow(row) : undefined;
    },
    async list() {
      return database
        .select({ id: recruiterShortlists.id, payload: recruiterShortlists.payload })
        .from(recruiterShortlists)
        .all()
        .map(parseShortlistRow)
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id, "en"),
        );
    },
    async save(shortlist) {
      database
        .insert(recruiterShortlists)
        .values({ id: shortlist.id, payload: shortlist, updatedAt: now() })
        .onConflictDoUpdate({
          target: recruiterShortlists.id,
          set: { payload: shortlist, updatedAt: now() },
        })
        .run();
    },
  };
}

function parseShortlistRow(row: { readonly id: string; readonly payload: unknown }): Shortlist {
  const shortlist = parsePersistedShortlist(row.payload);
  if (shortlist.id !== row.id) {
    throw new Error(`Persisted Shortlist ${row.id} contains identity ${shortlist.id}.`);
  }
  return shortlist;
}
