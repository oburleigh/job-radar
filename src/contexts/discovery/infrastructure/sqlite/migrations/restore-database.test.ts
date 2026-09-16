import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireDatabaseLease } from "@/platform/sqlite/database-lease";
import {
  initializeVersionZeroDatabase,
  versionOneToTwoMigration,
} from "~/tests/support/versioned-database";
import { migrateDatabase } from "./coordinator";

import { LEGACY_VERSION_ZERO_FINGERPRINT } from "./current-version";
import { restoreDatabase } from "./restore-database";
import { schemaFingerprint } from "./schema-signature";

describe("database restore", () => {
  let directory: string;
  let databasePath: string;
  let backupPath: string;
  let currentSchemaSql: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-restore-"));
    databasePath = path.join(directory, "job-radar.sqlite");
    backupPath = path.join(directory, "job-radar.v0.backup");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("Expected the test schema export.");
    currentSchemaSql = readFileSync(schemaPath, "utf8");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("requires explicit file paths", async () => {
    await expect(restoreDatabase({ databasePath: "", backupPath })).rejects.toThrow(
      "Database restore requires explicit database and backup paths.",
    );
    await expect(restoreDatabase({ databasePath, backupPath: "   " })).rejects.toThrow(
      "Database restore requires explicit database and backup paths.",
    );
    await expect(restoreDatabase({ databasePath: ":memory:", backupPath })).rejects.toThrow(
      "Database restore requires file-backed database and backup paths.",
    );
    await expect(restoreDatabase({ databasePath, backupPath: ":memory:" })).rejects.toThrow(
      "Database restore requires file-backed database and backup paths.",
    );
  });

  it("rejects the same source and target path", async () => {
    createDatabase(databasePath, { version: 0, key: "same-path" });

    await expect(restoreDatabase({ databasePath, backupPath: databasePath })).rejects.toThrow(
      "Database restore target and backup must be different paths.",
    );
  });

  it("rejects a backup alias that resolves to the target file", async () => {
    createDatabase(databasePath, { version: 0, key: "same-file" });
    const backupAlias = path.join(directory, "backup-alias.sqlite");
    symlinkSync(databasePath, backupAlias);

    await expect(restoreDatabase({ databasePath, backupPath: backupAlias })).rejects.toThrow(
      "Database restore target and backup must be different paths.",
    );
  });

  it("refuses the protected preview target without changing it", async () => {
    createDatabase(databasePath, { version: 1, key: "protected-target" });
    createDatabase(backupPath, { version: 0, key: "backup" });

    await expect(
      restoreDatabase({
        databasePath,
        backupPath,
        protectedDatabasePath: databasePath,
      }),
    ).rejects.toThrow(`Refusing to restore the protected database path: ${databasePath}`);

    expect(readCustomKeys(databasePath)).toEqual(["protected-target"]);
  });

  it("refuses an alias that resolves to the protected preview target", async () => {
    const protectedPath = path.join(directory, "protected.sqlite");
    createDatabase(protectedPath, { version: 1, key: "protected-target" });
    createDatabase(backupPath, { version: 0, key: "backup" });
    symlinkSync(protectedPath, databasePath);

    await expect(
      restoreDatabase({ databasePath, backupPath, protectedDatabasePath: protectedPath }),
    ).rejects.toThrow(`Refusing to restore the protected database path: ${databasePath}`);
    expect(readCustomKeys(protectedPath)).toEqual(["protected-target"]);
  });

  it("requires existing target and backup files", async () => {
    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      `Database restore target does not exist: ${databasePath}`,
    );

    createDatabase(databasePath, { version: 1, key: "target" });
    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      `Database restore backup does not exist: ${backupPath}`,
    );
  });

  it("refuses a target whose application lease is held", async () => {
    createDatabase(databasePath, { version: 1, key: "held-target" });
    createDatabase(backupPath, { version: 0, key: "backup" });
    const lease = acquireDatabaseLease(databasePath);

    try {
      await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
        `Database is already in use: ${databasePath}`,
      );
    } finally {
      lease.release();
    }

    expect(readCustomKeys(databasePath)).toEqual(["held-target"]);
  });

  it("rejects an unknown backup schema without changing the target", async () => {
    createDatabase(databasePath, { version: 1, key: "unchanged-target" });
    const unknown = new Database(backupPath);
    unknown.exec("CREATE TABLE unexpected (value text)");
    unknown.close();

    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      "Unsupported backup database schema.",
    );

    expect(readCustomKeys(databasePath)).toEqual(["unchanged-target"]);
  });

  it("rejects a version-one backup whose schema does not match that version", async () => {
    createDatabase(databasePath, { version: 1, key: "unchanged-target" });
    createDatabase(backupPath, { version: 1, key: "wrong-version" });

    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      "Unsupported backup database schema.",
    );
    expect(readCustomKeys(databasePath)).toEqual(["unchanged-target"]);
  });

  it("restores the version-one backup created by an upgrade", async () => {
    createDatabase(databasePath, { version: 0, key: "before-upgrade" });
    const original = new Database(databasePath);
    original.pragma("user_version = 1");
    original.close();
    await migrateDatabase({
      databasePath,
      backupPath,
      currentSchemaSql,
      migrations: [versionOneToTwoMigration],
    });
    const upgraded = new Database(databasePath);
    upgraded
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("after-upgrade", "true", 29);
    upgraded.close();

    const result = await restoreDatabase({ databasePath, backupPath });

    const restored = new Database(databasePath);
    expect(restored.pragma("user_version", { simple: true })).toBe(1);
    expect(schemaFingerprint(restored)).toBe(LEGACY_VERSION_ZERO_FINGERPRINT);
    expect(readCustomKeys(restored)).toEqual(["before-upgrade"]);
    restored.close();
    const retained = new Database(result.retainedFailedPath);
    expect(retained.pragma("user_version", { simple: true })).toBe(2);
    expect(readCustomKeys(retained)).toEqual(["before-upgrade", "after-upgrade"]);
    retained.close();
  });

  it.each([-1, 2, 99])(
    "rejects legacy schemas labelled as unsupported version %i",
    async (version) => {
      createDatabase(databasePath, { version: 1, key: "unchanged-target" });
      createDatabase(backupPath, { version: 0, key: "backup" });
      const backup = new Database(backupPath);
      backup.pragma(`user_version = ${version}`);
      backup.close();

      await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
        "Unsupported backup database schema.",
      );
      expect(readCustomKeys(databasePath)).toEqual(["unchanged-target"]);
    },
  );

  it("rejects a corrupt backup without changing the target", async () => {
    createDatabase(databasePath, { version: 1, key: "unchanged-target" });
    writeFileSync(backupPath, "not a SQLite database");

    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      "file is not a database",
    );
    expect(readCustomKeys(databasePath)).toEqual(["unchanged-target"]);
  });

  it("rejects a backup with foreign-key violations", async () => {
    createDatabase(databasePath, { version: 1, key: "unchanged-target" });
    createDatabase(backupPath, { version: 0, key: "backup" });
    const backup = new Database(backupPath);
    backup.pragma("foreign_keys = OFF");
    backup
      .prepare("INSERT INTO discovery_runs (profile_id, provider, started_at) VALUES (?, ?, ?)")
      .run(404, "serper", 17);
    backup.close();

    await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
      "The restored database failed SQLite foreign_key_check.",
    );
    expect(readCustomKeys(databasePath)).toEqual(["unchanged-target"]);
  });

  it("rejects a busy WAL checkpoint without replacing or retaining the target", async () => {
    createDatabase(databasePath, { version: 1, key: "target-before-busy" });
    createDatabase(backupPath, { version: 0, key: "backup" });
    const writer = new Database(databasePath);
    writer.pragma("journal_mode = WAL");
    writer.pragma("wal_autocheckpoint = 0");
    const reader = new Database(databasePath);
    reader.pragma("journal_mode = WAL");
    reader.exec("BEGIN");
    reader.prepare("SELECT * FROM app_settings").all();
    writer
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("written-after-read", JSON.stringify({ retained: true }), 23);

    try {
      await expect(restoreDatabase({ databasePath, backupPath })).rejects.toThrow(
        "Target database WAL checkpoint is busy.",
      );
    } finally {
      reader.exec("ROLLBACK");
      reader.close();
      writer.close();
    }

    expect(readCustomKeys(databasePath)).toEqual(["target-before-busy", "written-after-read"]);
    expect(readdirSync(directory).some((name) => name.includes(".failed-"))).toBe(false);
  });

  it("atomically restores the legacy backup and retains the replaced database and sidecars", async () => {
    createDatabase(databasePath, { version: 1, key: "failed-target" });
    createDatabase(backupPath, { version: 0, key: "restored-backup" });
    const backup = new Database(backupPath);
    backup
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("second-backup-row", JSON.stringify({ value: 2 }), 29);
    const expectedRowCounts = tableRowCounts(backup);
    backup.close();
    preserveValidWalSidecars(databasePath);

    const result = await restoreDatabase({ databasePath, backupPath });

    expect(result.restoredPath).toBe(databasePath);
    expect(result.retainedFailedPath).toMatch(
      new RegExp(`^${escapeRegExp(databasePath)}\\.failed-[0-9a-f-]+$`),
    );
    expect(existsSync(result.retainedFailedPath)).toBe(true);
    expect(existsSync(`${result.retainedFailedPath}-wal`)).toBe(true);
    expect(existsSync(`${result.retainedFailedPath}-shm`)).toBe(true);

    const restored = new Database(databasePath, { readonly: true, fileMustExist: true });
    expect(restored.pragma("user_version", { simple: true })).toBe(0);
    expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(restored.pragma("foreign_key_check")).toEqual([]);
    expect(schemaFingerprint(restored)).toBe(LEGACY_VERSION_ZERO_FINGERPRINT);
    expect(tableRowCounts(restored)).toEqual(expectedRowCounts);
    expect(readCustomKeys(restored)).toEqual(["restored-backup", "second-backup-row"]);
    restored.close();

    const retained = new Database(result.retainedFailedPath, {
      readonly: true,
      fileMustExist: true,
    });
    expect(retained.pragma("user_version", { simple: true })).toBe(1);
    expect(readCustomKeys(retained)).toEqual(["failed-target"]);
    retained.close();
  });

  function createDatabase(
    targetPath: string,
    input: { readonly version: number; readonly key: string },
  ): void {
    const sqlite = new Database(targetPath);
    if (input.version === 0) initializeVersionZeroDatabase(sqlite, currentSchemaSql);
    else sqlite.exec(currentSchemaSql);
    sqlite.pragma(`user_version = ${input.version}`);
    sqlite
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run(input.key, JSON.stringify({ key: input.key }), 17);
    sqlite.close();
  }
});

function preserveValidWalSidecars(databasePath: string): void {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("wal_autocheckpoint = 0");
  sqlite
    .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
    .run("sidecar-checkpoint", JSON.stringify({ retained: true }), 31);
  sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run("sidecar-checkpoint");
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  const savedWal = `${databasePath}.saved-wal`;
  const savedShm = `${databasePath}.saved-shm`;
  copyFileSync(`${databasePath}-wal`, savedWal);
  copyFileSync(`${databasePath}-shm`, savedShm);
  sqlite.close();
  copyFileSync(savedWal, `${databasePath}-wal`);
  copyFileSync(savedShm, `${databasePath}-shm`);
}

function tableRowCounts(sqlite: Database.Database): Record<string, number> {
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
    )
    .pluck()
    .all() as string[];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      sqlite
        .prepare(`SELECT count(*) FROM "${table.replaceAll('"', '""')}"`)
        .pluck()
        .get(),
    ]),
  ) as Record<string, number>;
}

function readCustomKeys(database: string | Database.Database): string[] {
  const owned = typeof database === "string";
  const sqlite = owned ? new Database(database, { readonly: true, fileMustExist: true }) : database;
  try {
    return sqlite
      .prepare("SELECT key FROM app_settings WHERE key NOT LIKE 'discovery.%' ORDER BY updated_at")
      .pluck()
      .all() as string[];
  } finally {
    if (owned) sqlite.close();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
