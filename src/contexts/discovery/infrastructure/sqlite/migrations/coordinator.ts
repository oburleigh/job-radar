import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { acquireDatabaseLease, type DatabaseLease } from "@/platform/sqlite/database-lease";

import { CURRENT_SCHEMA_VERSION, LEGACY_VERSION_ZERO_FINGERPRINT } from "./current-version";
import { schemaFingerprint } from "./schema-signature";

export type MigrationResult = {
  readonly status: "created" | "current" | "migrated";
  readonly version: number;
  readonly backupPath: string | null;
};

type MigrationInput = {
  readonly databasePath: string;
  readonly currentSchemaSql: string;
  readonly backupPath?: string;
  readonly migrations?: readonly MigrationStep[];
};

export type MigrationStep = {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly sourceFingerprint: string;
  readonly migrate: (sqlite: Database.Database) => void;
};

const versionZeroToOne: MigrationStep = {
  fromVersion: 0,
  toVersion: 1,
  sourceFingerprint: LEGACY_VERSION_ZERO_FINGERPRINT,
  migrate: () => undefined,
};

export async function migrateDatabase({
  databasePath,
  currentSchemaSql,
  backupPath,
  migrations = [],
}: MigrationInput): Promise<MigrationResult> {
  const inMemory = databasePath === ":memory:";
  const resolvedDatabasePath = inMemory ? databasePath : path.resolve(databasePath);
  let lease: DatabaseLease | null = null;
  let sqlite: Database.Database | null = null;
  try {
    if (!inMemory) {
      mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });
      lease = acquireDatabaseLease(resolvedDatabasePath);
    }
    const connection = new Database(resolvedDatabasePath);
    sqlite = connection;
    connection.pragma("foreign_keys = ON");
    assertIntegrity(connection, "database");

    const expected = new Database(":memory:");
    let currentFingerprint: string;
    try {
      expected.exec(currentSchemaSql);
      currentFingerprint = schemaFingerprint(expected);
    } finally {
      expected.close();
    }

    if (tableCount(connection) === 0) {
      connection
        .transaction(() => {
          connection.exec(currentSchemaSql);
          connection.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
          assertForeignKeys(connection);
          assertFingerprint(connection, currentFingerprint, "current");
        })
        .immediate();
      return { status: "created", version: CURRENT_SCHEMA_VERSION, backupPath: null };
    }

    const version = connection.pragma("user_version", { simple: true }) as number;
    if (version === CURRENT_SCHEMA_VERSION) {
      assertFingerprint(connection, currentFingerprint, "current");
      return { status: "current", version, backupPath: null };
    }
    const migrationPath = resolveMigrationPath(version, [versionZeroToOne, ...migrations]);

    const resolvedBackupPath = path.resolve(
      backupPath ?? `${resolvedDatabasePath}.v${version}-${Date.now()}.backup`,
    );
    if (existsSync(resolvedBackupPath)) {
      throw new Error(`Database backup already exists: ${resolvedBackupPath}`);
    }
    await connection.backup(resolvedBackupPath);
    verifyBackupIntegrity(resolvedBackupPath);
    const initialStep = migrationPath[0];
    if (!initialStep) throw new Error(`Unsupported database schema version ${version}.`);
    assertFingerprint(connection, initialStep.sourceFingerprint, `version ${version}`);
    verifyBackupFingerprint(resolvedBackupPath, initialStep.sourceFingerprint, version);

    connection
      .transaction(() => {
        for (const step of migrationPath) {
          assertFingerprint(connection, step.sourceFingerprint, `version ${step.fromVersion}`);
          step.migrate(connection);
          connection.pragma(`user_version = ${step.toVersion}`);
        }
        assertForeignKeys(connection);
        assertFingerprint(connection, currentFingerprint, "current");
      })
      .immediate();

    return {
      status: "migrated",
      version: CURRENT_SCHEMA_VERSION,
      backupPath: resolvedBackupPath,
    };
  } finally {
    sqlite?.close();
    lease?.release();
  }
}

function resolveMigrationPath(
  version: number,
  migrations: readonly MigrationStep[],
): readonly MigrationStep[] {
  const start = migrations.findIndex((step) => step.fromVersion === version);
  if (start === -1) throw new Error(`Unsupported database schema version ${version}.`);

  const path: MigrationStep[] = [];
  let nextVersion = version;
  for (const step of migrations.slice(start)) {
    if (step.fromVersion !== nextVersion) break;
    if (step.toVersion <= step.fromVersion) {
      throw new Error(`Invalid database migration from version ${step.fromVersion}.`);
    }
    path.push(step);
    nextVersion = step.toVersion;
    if (nextVersion === CURRENT_SCHEMA_VERSION) return path;
  }
  throw new Error(`Unsupported database schema version ${version}.`);
}

function tableCount(sqlite: Database.Database): number {
  return sqlite
    .prepare(
      "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
    )
    .pluck()
    .get() as number;
}

function assertIntegrity(sqlite: Database.Database, label: string): void {
  const result = sqlite.pragma("integrity_check", { simple: true });
  if (result !== "ok") throw new Error(`The ${label} failed SQLite integrity_check.`);
}

function assertForeignKeys(sqlite: Database.Database): void {
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error("The migrated database failed SQLite foreign_key_check.");
  }
}

function assertFingerprint(sqlite: Database.Database, expected: string, label: string): void {
  if (schemaFingerprint(sqlite) !== expected) {
    throw new Error(`Unsupported ${label} database schema.`);
  }
}

function verifyBackupIntegrity(backupPath: string): void {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    assertIntegrity(backup, "database backup");
  } finally {
    backup.close();
  }
}

function verifyBackupFingerprint(
  backupPath: string,
  expectedFingerprint: string,
  version: number,
): void {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    assertFingerprint(backup, expectedFingerprint, `version ${version} backup`);
  } finally {
    backup.close();
  }
}
