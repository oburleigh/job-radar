import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, realpathSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { acquireDatabaseLease, type DatabaseLease } from "@/platform/sqlite/database-lease";

import { LEGACY_VERSION_ZERO_FINGERPRINT } from "./current-version";
import { schemaFingerprint } from "./schema-signature";

export type RestoreResult = {
  readonly restoredPath: string;
  readonly retainedFailedPath: string;
};

type RestoreInput = {
  readonly databasePath: string;
  readonly backupPath: string;
  readonly protectedDatabasePath?: string;
};

type RowCounts = Readonly<Record<string, number>>;

type WalCheckpointResult = {
  readonly busy: number;
  readonly log: number;
  readonly checkpointed: number;
};

export async function restoreDatabase({
  databasePath,
  backupPath,
  protectedDatabasePath,
}: RestoreInput): Promise<RestoreResult> {
  assertExplicitPaths(databasePath, backupPath);
  const requestedDatabasePath = path.resolve(databasePath);
  const requestedBackupPath = path.resolve(backupPath);
  if (requestedDatabasePath === requestedBackupPath) {
    throw new Error("Database restore target and backup must be different paths.");
  }
  if (!existsSync(requestedDatabasePath)) {
    throw new Error(`Database restore target does not exist: ${requestedDatabasePath}`);
  }
  if (!existsSync(requestedBackupPath)) {
    throw new Error(`Database restore backup does not exist: ${requestedBackupPath}`);
  }
  const restoredPath = realpathSync(requestedDatabasePath);
  const resolvedBackupPath = realpathSync(requestedBackupPath);
  if (restoredPath === resolvedBackupPath) {
    throw new Error("Database restore target and backup must be different paths.");
  }
  if (protectedDatabasePath && sameFile(restoredPath, protectedDatabasePath)) {
    throw new Error(`Refusing to restore the protected database path: ${requestedDatabasePath}`);
  }

  const retainedFailedPath = `${restoredPath}.failed-${randomUUID()}`;
  const temporaryPath = `${restoredPath}.restore-${randomUUID()}.tmp`;
  let lease: DatabaseLease | null = null;
  let target: Database.Database | null = null;
  let targetRetained = false;
  let replacementInstalled = false;
  const sidecars = ["-wal", "-shm"].map((suffix) => ({
    source: `${restoredPath}${suffix}`,
    retained: `${retainedFailedPath}${suffix}`,
  }));

  try {
    lease = acquireDatabaseLease(restoredPath);
    const expectedRowCounts = await prepareVerifiedRestore(resolvedBackupPath, temporaryPath);

    target = new Database(restoredPath, { fileMustExist: true });
    target.pragma("busy_timeout = 0");
    const checkpoint = target.pragma("wal_checkpoint(TRUNCATE)") as WalCheckpointResult[];
    if (checkpoint.length !== 1 || checkpoint[0]?.busy !== 0) {
      throw new Error("Target database WAL checkpoint is busy.");
    }
    for (const sidecar of sidecars) {
      if (existsSync(sidecar.source)) copyFileSync(sidecar.source, sidecar.retained);
    }
    target.close();
    target = null;

    renameSync(restoredPath, retainedFailedPath);
    targetRetained = true;
    for (const sidecar of sidecars) {
      if (!existsSync(sidecar.source)) continue;
      rmSync(sidecar.retained, { force: true });
      renameSync(sidecar.source, sidecar.retained);
    }
    renameSync(temporaryPath, restoredPath);
    replacementInstalled = true;

    verifyRestoredDatabase(restoredPath, expectedRowCounts);
    return { restoredPath, retainedFailedPath };
  } catch (error) {
    if (targetRetained) {
      try {
        if (replacementInstalled && existsSync(restoredPath)) {
          renameSync(restoredPath, temporaryPath);
        }
        renameSync(retainedFailedPath, restoredPath);
        for (const sidecar of sidecars) {
          if (existsSync(sidecar.retained)) renameSync(sidecar.retained, sidecar.source);
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Database restore failed and the original remains at ${retainedFailedPath}.`,
        );
      }
    } else {
      for (const sidecar of sidecars) rmSync(sidecar.retained, { force: true });
    }
    throw error;
  } finally {
    target?.close();
    rmSync(temporaryPath, { force: true });
    lease?.release();
  }
}

function sameFile(firstPath: string, secondPath: string): boolean {
  const resolvedFirst = path.resolve(firstPath);
  const resolvedSecond = path.resolve(secondPath);
  if (resolvedFirst === resolvedSecond) return true;
  return (
    existsSync(resolvedFirst) &&
    existsSync(resolvedSecond) &&
    realpathSync(resolvedFirst) === realpathSync(resolvedSecond)
  );
}

function assertExplicitPaths(databasePath: string, backupPath: string): void {
  if (
    typeof databasePath !== "string" ||
    databasePath.trim() === "" ||
    typeof backupPath !== "string" ||
    backupPath.trim() === ""
  ) {
    throw new Error("Database restore requires explicit database and backup paths.");
  }
  if (databasePath === ":memory:" || backupPath === ":memory:") {
    throw new Error("Database restore requires file-backed database and backup paths.");
  }
}

async function prepareVerifiedRestore(
  backupPath: string,
  temporaryPath: string,
): Promise<RowCounts> {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  let expectedRowCounts: RowCounts;
  try {
    assertIntegrity(backup, "database backup");
    assertSupportedBackupSchema(backup, "backup");
    expectedRowCounts = tableRowCounts(backup);
    await backup.backup(temporaryPath);
  } finally {
    backup.close();
  }

  const restored = new Database(temporaryPath, { fileMustExist: true });
  try {
    restored.pragma("foreign_keys = ON");
    assertIntegrity(restored, "restored database");
    assertForeignKeys(restored);
    assertSupportedBackupSchema(restored, "restored");
    assertRowCounts(restored, expectedRowCounts);
  } finally {
    restored.close();
  }
  return expectedRowCounts;
}

function verifyRestoredDatabase(databasePath: string, expectedRowCounts: RowCounts): void {
  const restored = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assertIntegrity(restored, "restored database");
    assertForeignKeys(restored);
    assertSupportedBackupSchema(restored, "restored");
    assertRowCounts(restored, expectedRowCounts);
  } finally {
    restored.close();
  }
}

function assertIntegrity(sqlite: Database.Database, label: string): void {
  if (sqlite.pragma("integrity_check", { simple: true }) !== "ok") {
    throw new Error(`The ${label} failed SQLite integrity_check.`);
  }
}

function assertForeignKeys(sqlite: Database.Database): void {
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error("The restored database failed SQLite foreign_key_check.");
  }
}

function assertSupportedBackupSchema(sqlite: Database.Database, label: string): void {
  const version = sqlite.pragma("user_version", { simple: true }) as number;
  if (
    (version !== 0 && version !== 1) ||
    schemaFingerprint(sqlite) !== LEGACY_VERSION_ZERO_FINGERPRINT
  ) {
    throw new Error(`Unsupported ${label} database schema.`);
  }
}

function tableRowCounts(sqlite: Database.Database): RowCounts {
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
  ) as RowCounts;
}

function assertRowCounts(sqlite: Database.Database, expected: RowCounts): void {
  if (JSON.stringify(tableRowCounts(sqlite)) !== JSON.stringify(expected)) {
    throw new Error("The restored database row counts differ from the selected backup.");
  }
}
