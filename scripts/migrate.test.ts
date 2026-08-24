import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const pnpmExecutable = "pnpm";

describe("database setup command", () => {
  let directory: string;
  let databasePath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-clean-start-"));
    databasePath = path.join(directory, "job-radar.sqlite");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates only product defaults and preserves user-edited configuration on rerun", () => {
    runDatabaseSetup(databasePath);

    const sqlite = new Database(databasePath);
    expect(count(sqlite, "app_settings")).toBe(7);
    expect(count(sqlite, "ats_integrations")).toBe(13);
    expect(count(sqlite, "source_domains")).toBe(15);
    for (const table of [
      "search_profiles",
      "company_boards",
      "discovery_runs",
      "discovery_queries",
      "discovery_hits",
      "jobs",
      "job_matches",
      "job_states",
    ]) {
      expect(count(sqlite, table), table).toBe(0);
    }

    sqlite
      .prepare("UPDATE app_settings SET value = ? WHERE key = 'network'")
      .run(JSON.stringify({ timeoutMs: 45000, userAgent: "Contributor setup" }));
    sqlite
      .prepare("UPDATE source_domains SET enabled = 0 WHERE pattern = ?")
      .run("jobs.ashbyhq.com");
    sqlite.close();

    runDatabaseSetup(databasePath);

    const rerun = new Database(databasePath, { readonly: true });
    expect(
      JSON.parse(
        rerun
          .prepare("SELECT value FROM app_settings WHERE key = 'network'")
          .pluck()
          .get() as string,
      ),
    ).toEqual({ timeoutMs: 45000, userAgent: "Contributor setup" });
    expect(
      rerun
        .prepare("SELECT enabled FROM source_domains WHERE pattern = ?")
        .pluck()
        .get("jobs.ashbyhq.com"),
    ).toBe(0);
    rerun.close();
  }, 30_000);
});

function runDatabaseSetup(databasePath: string) {
  execFileSync(pnpmExecutable, ["db:setup"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      SERPER_API_KEY: "clean-start-test-key",
    },
    shell: process.platform === "win32",
    stdio: "pipe",
  });
}

function count(sqlite: Database.Database, table: string): number {
  return sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
}
