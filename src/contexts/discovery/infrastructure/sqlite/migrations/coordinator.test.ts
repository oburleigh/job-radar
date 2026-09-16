import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initializeVersionZeroDatabase,
  versionOneToTwoMigration,
} from "~/tests/support/versioned-database";
import { migrateDatabase as coordinateDatabaseMigration } from "./coordinator";

function migrateDatabase(input: Parameters<typeof coordinateDatabaseMigration>[0]) {
  return coordinateDatabaseMigration({ ...input, migrations: [versionOneToTwoMigration] });
}

describe("database migration coordinator", () => {
  let directory: string;
  let databasePath: string;
  let backupPath: string;
  let currentSchemaSql: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-migration-"));
    databasePath = path.join(directory, "job-radar.sqlite");
    backupPath = path.join(directory, "job-radar.v0.backup");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("Expected the test schema export.");
    currentSchemaSql = readFileSync(schemaPath, "utf8");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("backs up and versions the exact legacy schema without changing records", async () => {
    const legacy = new Database(databasePath);
    initializeVersionZeroDatabase(legacy, currentSchemaSql);
    const expectedRecords = seedPreservedRecords(legacy);
    legacy.close();

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).resolves.toEqual({
      status: "migrated",
      version: 2,
      backupPath,
    });

    const migrated = new Database(databasePath, { readonly: true });
    expect(migrated.pragma("user_version", { simple: true })).toBe(2);
    expect(migrated.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(readPreservedRecords(migrated)).toEqual(expectedRecords);
    migrated.close();

    const backup = new Database(backupPath, { readonly: true });
    expect(backup.pragma("user_version", { simple: true })).toBe(0);
    expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(readPreservedRecords(backup)).toEqual(expectedRecords);
    backup.close();
  });

  it("creates an empty database at the current version without a backup", async () => {
    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).resolves.toEqual({
      status: "created",
      version: 2,
      backupPath: null,
    });

    const created = new Database(databasePath, { readonly: true });
    expect(created.pragma("user_version", { simple: true })).toBe(2);
    expect(created.prepare("SELECT count(*) FROM app_settings").pluck().get()).toBe(0);
    created.close();
    expect(() => new Database(backupPath, { fileMustExist: true })).toThrow();
  });

  it("keeps the in-memory database sentinel off disk", async () => {
    const previousWorkingDirectory = process.cwd();
    process.chdir(directory);
    try {
      await expect(
        migrateDatabase({ databasePath: ":memory:", currentSchemaSql }),
      ).resolves.toEqual({ status: "created", version: 2, backupPath: null });
      expect(existsSync(path.join(directory, ":memory:"))).toBe(false);
    } finally {
      process.chdir(previousWorkingDirectory);
    }
  });

  it("releases the lease when opening the database fails", async () => {
    const directoryPath = path.join(directory, "not-a-database");
    mkdirSync(directoryPath);

    await expect(
      migrateDatabase({ databasePath: directoryPath, currentSchemaSql }),
    ).rejects.toThrow();

    const { acquireDatabaseLease } = await import("@/platform/sqlite/database-lease");
    const lease = acquireDatabaseLease(directoryPath);
    lease.release();
  });

  it("rejects unknown version-zero drift without changing its schema or records", async () => {
    const drifted = new Database(databasePath);
    initializeVersionZeroDatabase(drifted, currentSchemaSql);
    drifted.exec("ALTER TABLE app_settings ADD COLUMN unexpected text");
    drifted
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("custom", JSON.stringify({ retained: true }), 17);
    const schemaBefore = drifted.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all();
    drifted.close();

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).rejects.toThrow(
      "Unsupported version 0 database schema",
    );

    const retained = new Database(databasePath, { readonly: true });
    expect(retained.pragma("user_version", { simple: true })).toBe(0);
    expect(retained.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all()).toEqual(
      schemaBefore,
    );
    expect(
      retained.prepare("SELECT value FROM app_settings WHERE key = 'custom'").pluck().get(),
    ).toBe(JSON.stringify({ retained: true }));
    retained.close();
  });

  it("accepts an already-current database without creating another backup", async () => {
    const current = new Database(databasePath);
    current.exec(currentSchemaSql);
    current.pragma("user_version = 2");
    current.close();

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).resolves.toEqual({
      status: "current",
      version: 2,
      backupPath: null,
    });
    expect(() => new Database(backupPath, { fileMustExist: true })).toThrow();
  });

  it("rejects an unknown schema version before creating a backup", async () => {
    const unknown = new Database(databasePath);
    unknown.exec(currentSchemaSql);
    unknown.pragma("user_version = 3");
    unknown.close();

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).rejects.toThrow(
      "Unsupported database schema version 3",
    );
    expect(() => new Database(backupPath, { fileMustExist: true })).toThrow();
  });

  it("rejects a non-ok integrity result before creating a backup", async () => {
    const legacy = new Database(databasePath);
    initializeVersionZeroDatabase(legacy, currentSchemaSql);
    legacy.close();
    const originalPragma = Database.prototype.pragma;
    vi.spyOn(Database.prototype, "pragma").mockImplementation(function (
      this: Database.Database,
      source,
      options,
    ) {
      if (source === "integrity_check") return "row missing from index";
      return originalPragma.call(this, source, options);
    });

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).rejects.toThrow(
      "The database failed SQLite integrity_check",
    );

    expect(() => new Database(backupPath, { fileMustExist: true })).toThrow();
    const retained = new Database(databasePath, { readonly: true });
    expect(retained.pragma("user_version", { simple: true })).toBe(0);
    retained.close();
  });

  it("rejects a backup whose schema differs from the accepted source", async () => {
    const legacy = new Database(databasePath);
    initializeVersionZeroDatabase(legacy, currentSchemaSql);
    seedPreservedRecords(legacy);
    legacy.close();
    const originalBackup = Database.prototype.backup;
    vi.spyOn(Database.prototype, "backup").mockImplementationOnce(async function (
      this: Database.Database,
      destination,
      options,
    ) {
      const result = await originalBackup.call(this, destination, options);
      const driftedBackup = new Database(destination);
      driftedBackup.exec("ALTER TABLE app_settings ADD COLUMN unexpected text");
      driftedBackup.close();
      return result;
    });

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).rejects.toThrow(
      "Unsupported version 0 backup database schema",
    );

    const retained = new Database(databasePath, { readonly: true });
    expect(retained.pragma("user_version", { simple: true })).toBe(0);
    expect(readPreservedRecords(retained).settings).toHaveLength(2);
    retained.close();
  });

  it("rolls back the version when legacy records violate a foreign key", async () => {
    const legacy = new Database(databasePath);
    initializeVersionZeroDatabase(legacy, currentSchemaSql);
    legacy.pragma("foreign_keys = OFF");
    legacy
      .prepare("INSERT INTO discovery_runs (profile_id, provider, started_at) VALUES (?, ?, ?)")
      .run(404, "serper", 17);
    legacy.close();

    await expect(migrateDatabase({ databasePath, backupPath, currentSchemaSql })).rejects.toThrow(
      "The migrated database failed SQLite foreign_key_check",
    );

    const retained = new Database(databasePath, { readonly: true });
    expect(retained.pragma("user_version", { simple: true })).toBe(0);
    expect(retained.prepare("SELECT profile_id FROM discovery_runs").pluck().get()).toBe(404);
    retained.close();
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    expect(backup.pragma("user_version", { simple: true })).toBe(0);
    backup.close();
  });

  it("rolls back the version when current-schema validation fails", async () => {
    const legacy = new Database(databasePath);
    initializeVersionZeroDatabase(legacy, currentSchemaSql);
    legacy.close();

    await expect(
      migrateDatabase({
        databasePath,
        backupPath,
        currentSchemaSql: `${currentSchemaSql}\nCREATE TABLE unexpected_current (id integer);`,
      }),
    ).rejects.toThrow("Unsupported current database schema");

    const retained = new Database(databasePath, { readonly: true });
    expect(retained.pragma("user_version", { simple: true })).toBe(0);
    expect(
      retained
        .prepare("SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .pluck()
        .get("unexpected_current"),
    ).toBe(0);
    retained.close();
  });
});

function seedPreservedRecords(sqlite: Database.Database) {
  sqlite
    .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?)")
    .run(
      "custom-a",
      JSON.stringify({ retained: "alpha" }),
      17,
      "custom-b",
      JSON.stringify({ retained: "beta" }),
      29,
    );
  sqlite
    .prepare(
      "INSERT INTO source_domains (ats_type, pattern, enabled, supports_board_sync, priority) VALUES (?, ?, ?, ?, ?)",
    )
    .run("greenhouse", "jobs.example.test", 0, 1, 47);
  sqlite
    .prepare(
      `INSERT INTO company_boards (
        ats_type, canonical_key, company_name, slug, base_url, config, enabled, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "greenhouse",
      "greenhouse:example",
      "Example",
      "example",
      "https://boards.example.test/example",
      JSON.stringify({ token: "retained" }),
      0,
      31,
    );
  const profileId = sqlite
    .prepare(
      `INSERT INTO search_profiles (
        name, title_terms, location_terms, excluded_title_terms,
        excluded_description_terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "Retained profile",
      JSON.stringify(["Director"]),
      JSON.stringify(["Dubai"]),
      JSON.stringify([]),
      JSON.stringify([]),
      37,
      41,
    ).lastInsertRowid;
  sqlite
    .prepare(
      "INSERT INTO discovery_runs (profile_id, provider, status, query_count, started_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(profileId, "serper", "completed", 7, 43);
  return readPreservedRecords(sqlite);
}

function readPreservedRecords(sqlite: Database.Database) {
  return {
    settings: sqlite.prepare("SELECT key, value, updated_at FROM app_settings ORDER BY key").all(),
    sources: sqlite
      .prepare(
        "SELECT ats_type, pattern, enabled, supports_board_sync, priority FROM source_domains ORDER BY pattern",
      )
      .all(),
    boards: sqlite
      .prepare(
        "SELECT canonical_key, config, enabled, discovered_at FROM company_boards ORDER BY canonical_key",
      )
      .all(),
    runs: sqlite
      .prepare(
        "SELECT profile_id, provider, status, query_count, started_at FROM discovery_runs ORDER BY id",
      )
      .all(),
  };
}
