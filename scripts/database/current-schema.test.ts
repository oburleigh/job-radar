import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { initializeTestSchema } from "~/tests/support/current-schema";
import { initializeCurrentSchema } from "./current-schema";

describe("current schema initialization", () => {
  it("ignores test-only schema environment when initializing an application database", () => {
    const sqlite = new Database(":memory:");
    vi.stubEnv("JOB_RADAR_TEST_SCHEMA_SQL", "/missing-test-schema.sql");
    try {
      initializeCurrentSchema(drizzle(sqlite));
      expect(sqlite.prepare("SELECT count(*) FROM app_settings").pluck().get()).toBe(0);
    } finally {
      vi.unstubAllEnvs();
      sqlite.close();
    }
  });

  it("accepts a current database with a retained development migration journal", () => {
    const sqlite = new Database(":memory:");
    try {
      const database = drizzle(sqlite);
      initializeTestSchema(database);
      sqlite.exec(
        "CREATE TABLE __drizzle_migrations (id integer); INSERT INTO __drizzle_migrations VALUES (17)",
      );
      initializeTestSchema(database);
      expect(sqlite.prepare("SELECT id FROM __drizzle_migrations").pluck().all()).toEqual([17]);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    "DROP INDEX job_matches_screening_summary_idx",
    "DROP TRIGGER job_matches_follow_listing_activation",
    "ALTER TABLE app_settings ADD COLUMN unexpected text",
  ])("rejects schema drift without modifying the database: %s", (change) => {
    const sqlite = new Database(":memory:");
    try {
      const database = drizzle(sqlite);
      initializeTestSchema(database);
      sqlite.exec(change);
      sqlite
        .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
        .run("custom", "unchanged", 1);
      const schemaBefore = sqlite.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
      expect(() => initializeTestSchema(database)).toThrow("Unsupported existing database schema");
      expect(sqlite.prepare("SELECT * FROM sqlite_schema ORDER BY name").all()).toEqual(
        schemaBefore,
      );
      expect(
        sqlite.prepare("SELECT value FROM app_settings WHERE key = 'custom'").pluck().get(),
      ).toBe("unchanged");
    } finally {
      sqlite.close();
    }
  });
});
