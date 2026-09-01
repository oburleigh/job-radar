import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteSourceCoverageStore } from "./sqlite-source-coverage-store";

describe("SQLite source coverage store", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
  });

  afterEach(() => {
    sqlite.close();
  });

  it("persists the company-board refresh policy without changing board choices", () => {
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, new Date("2026-09-01T09:00:00.000Z"));
    database
      .insert(schema.companyBoards)
      .values({
        atsType: "ashby",
        canonicalKey: "ashby:acme",
        companyName: "Acme",
        slug: "acme",
        baseUrl: "https://jobs.ashbyhq.com/acme",
        config: {},
        enabled: true,
        discoveredAt: new Date("2026-09-01T09:00:00.000Z"),
      })
      .run();

    createSqliteSourceCoverageStore(database).setCompanyBoardRefreshEnabled(
      false,
      new Date("2026-09-01T10:00:00.000Z"),
    );

    expect(getJobRadarConfig(database).discovery.companyBoardRefreshEnabled).toBe(false);
    expect(database.select().from(schema.companyBoards).get()?.enabled).toBe(true);
  });
});
