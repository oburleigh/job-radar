import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  appSettings,
  atsIntegrations,
  companyBoards,
  discoveryRuns,
  jobs,
  searchProfiles,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { bootstrapJobRadar } from "./bootstrap-job-radar";

describe("Job Radar database bootstrap", () => {
  let directory: string;
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-bootstrap-"));
    sqlite = new Database(path.join(directory, "job-radar.sqlite"));
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps schema migration separate from product defaults", () => {
    expect(database.select().from(appSettings).all()).toEqual([]);
    expect(database.select().from(atsIntegrations).all()).toEqual([]);
    expect(database.select().from(sourceDomains).all()).toEqual([]);

    bootstrapJobRadar(database, new Date("2026-08-20T00:00:00.000Z"));

    expect(database.select().from(appSettings).all()).toHaveLength(7);
    expect(database.select().from(atsIntegrations).all()).toHaveLength(13);
    expect(database.select().from(sourceDomains).all()).toHaveLength(15);
    expect(database.select().from(searchProfiles).all()).toEqual([]);
    expect(database.select().from(companyBoards).all()).toEqual([]);
    expect(database.select().from(jobs).all()).toEqual([]);
    expect(database.select().from(discoveryRuns).all()).toEqual([]);
  });

  it("does not overwrite settings or sources changed by the user", () => {
    const firstBootstrapAt = new Date("2026-08-20T00:00:00.000Z");
    bootstrapJobRadar(database, firstBootstrapAt);
    database
      .update(appSettings)
      .set({ value: { timeoutMs: 45000, userAgent: "My local client" } })
      .where(eq(appSettings.key, "network"))
      .run();
    database
      .update(sourceDomains)
      .set({ enabled: false })
      .where(eq(sourceDomains.pattern, "jobs.ashbyhq.com"))
      .run();

    bootstrapJobRadar(database, new Date("2026-08-21T00:00:00.000Z"));

    expect(
      database.select().from(appSettings).where(eq(appSettings.key, "network")).get()?.value,
    ).toEqual({ timeoutMs: 45000, userAgent: "My local client" });
    expect(
      database
        .select()
        .from(sourceDomains)
        .where(eq(sourceDomains.pattern, "jobs.ashbyhq.com"))
        .get()?.enabled,
    ).toBe(false);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}
