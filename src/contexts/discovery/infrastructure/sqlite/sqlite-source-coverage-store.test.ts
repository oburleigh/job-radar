import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import { initializeTestSchema } from "~/tests/support/current-schema";

import { createSqliteSourceCoverageStore } from "./sqlite-source-coverage-store";

describe("SQLite source coverage store", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
  });

  afterEach(() => {
    sqlite.close();
  });

  it.each([false, true])("changes every company-board choice to %s", (enabled) => {
    const database = drizzle(sqlite, { schema });
    initializeTestSchema(database);
    database
      .insert(schema.companyBoards)
      .values(
        ["acme", "example"].map((slug) => ({
          atsType: "ashby" as const,
          canonicalKey: `ashby:${slug}`,
          companyName: slug,
          slug,
          baseUrl: `https://jobs.ashbyhq.com/${slug}`,
          config: {},
          enabled: !enabled,
          discoveredAt: new Date("2026-09-01T09:00:00.000Z"),
        })),
      )
      .run();

    createSqliteSourceCoverageStore(database).setCompanyBoardsEnabled(enabled);

    expect(
      database
        .select()
        .from(schema.companyBoards)
        .all()
        .map((board) => board.enabled),
    ).toEqual([enabled, enabled]);
  });
});
