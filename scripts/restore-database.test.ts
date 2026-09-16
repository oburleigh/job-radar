import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeVersionZeroDatabase } from "~/tests/support/versioned-database";

describe("database restore command", () => {
  let directory: string;
  let databasePath: string;
  let backupPath: string;
  let currentSchemaSql: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-restore-command-"));
    databasePath = path.join(directory, "job-radar.sqlite");
    backupPath = path.join(directory, "job-radar.v0.backup");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("Expected the test schema export.");
    currentSchemaSql = readFileSync(schemaPath, "utf8");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("fails with a stable message when explicit paths are missing", () => {
    const result = runRestore([]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Database restore failed: Expected --database <path> and --backup <path>.",
    );
  });

  it("rejects command options outside the explicit restore contract", () => {
    const result = runRestore(["--database", databasePath, "--backup", backupPath, "--latest"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Database restore failed: Expected --database <path> and --backup <path>.",
    );
  });

  it("restores the selected backup and prints both resulting paths", () => {
    createDatabase(databasePath, 2, "failed-target");
    createDatabase(backupPath, 0, "restored-backup");

    const result = runRestore(["--database", databasePath, "--backup", backupPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Restored database: ${databasePath}`);
    expect(result.stdout).toContain(`Retained failed database: ${databasePath}.failed-`);
    const restored = new Database(databasePath, { readonly: true, fileMustExist: true });
    expect(restored.pragma("user_version", { simple: true })).toBe(0);
    expect(restored.prepare("SELECT key FROM app_settings").pluck().all()).toEqual([
      "restored-backup",
    ]);
    restored.close();
  }, 30_000);

  function createDatabase(targetPath: string, version: number, key: string): void {
    const sqlite = new Database(targetPath);
    if (version === 0) initializeVersionZeroDatabase(sqlite, currentSchemaSql);
    else sqlite.exec(currentSchemaSql);
    sqlite.pragma(`user_version = ${version}`);
    sqlite
      .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify({ key }), 17);
    sqlite.close();
  }
});

function runRestore(arguments_: string[]) {
  return spawnSync("pnpm", ["db:restore", "--", ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: path.join(tmpdir(), "job-radar-missing-restore.env"),
    },
    shell: process.platform === "win32",
  });
}
