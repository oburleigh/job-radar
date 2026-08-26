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
    expect(count(sqlite, "app_settings")).toBe(8);
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

  it("repairs legacy structured board jobs without promoting search-only leads", () => {
    runDatabaseSetup(databasePath);

    const sqlite = new Database(databasePath);
    const profileId = seedProfile(sqlite);
    const boardId = sqlite
      .prepare(
        `INSERT INTO company_boards (
          ats_type, canonical_key, company_name, slug, base_url, config, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "greenhouse",
        "greenhouse:example",
        "Example",
        "example",
        "https://boards.greenhouse.io/example",
        JSON.stringify({}),
        Date.parse("2026-08-24T00:00:00.000Z"),
      ).lastInsertRowid;

    seedJob(sqlite, {
      boardId,
      dedupeKey: "legacy-structured",
      rawPayload: { id: 8124387, title: "Director of Engineering" },
    });
    seedJob(sqlite, {
      boardId,
      dedupeKey: "search-only",
      rawPayload: {},
    });
    seedJob(sqlite, {
      boardId,
      dedupeKey: "verification-only",
      rawPayload: {
        verification: {
          status: "unavailable",
          reason: "protected",
          checkedAt: "2026-08-24T00:00:00.000Z",
        },
      },
    });
    seedJob(sqlite, {
      boardId: null,
      dedupeKey: "off-board-vendor-payload",
      rawPayload: { id: 8124388, title: "Director of Engineering" },
    });
    sqlite.close();

    runDatabaseSetup(databasePath);

    const migrated = new Database(databasePath, { readonly: true });
    expect(readEvidence(migrated, "legacy-structured")).toBe("structured");
    expect(readEvidence(migrated, "search-only")).toBe("search-lead");
    expect(readEvidence(migrated, "verification-only")).toBe("search-lead");
    expect(readEvidence(migrated, "off-board-vendor-payload")).toBe("search-lead");
    expect(readMatchStatus(migrated, profileId, "legacy-structured")).toBe("matched");
    expect(readMatchStatus(migrated, profileId, "search-only")).toBe("excluded");
    expect(readMatchStatus(migrated, profileId, "verification-only")).toBe("excluded");
    migrated.close();

    const interrupted = new Database(databasePath);
    interrupted
      .prepare(
        `UPDATE job_matches
         SET status = ?, score = 0, reasons = ?, exclusion_reasons = ?, updated_at = ?
         WHERE profile_id = ? AND job_id = (
           SELECT id FROM jobs WHERE dedupe_key = ?
         )`,
      )
      .run(
        "excluded",
        JSON.stringify([]),
        JSON.stringify([{ code: "unverified-lead" }]),
        Date.parse("2026-08-24T01:00:00.000Z"),
        profileId,
        "legacy-structured",
      );
    interrupted.close();

    runDatabaseSetup(databasePath);

    const recovered = new Database(databasePath, { readonly: true });
    expect(readEvidence(recovered, "legacy-structured")).toBe("structured");
    expect(readMatchStatus(recovered, profileId, "legacy-structured")).toBe("matched");
    recovered.close();
  }, 30_000);
});

function runDatabaseSetup(databasePath: string) {
  execFileSync(pnpmExecutable, ["db:setup"], {
    cwd: repositoryRoot,
    env: databaseSetupEnvironment(databasePath),
    shell: process.platform === "win32",
    stdio: "pipe",
  });
}

function databaseSetupEnvironment(databasePath: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PATH: databasePath,
    DOTENV_CONFIG_PATH: path.join(path.dirname(databasePath), "missing.env"),
  };
  delete environment.BRAVE_SEARCH_API_KEY;
  delete environment.SERPAPI_KEY;
  delete environment.SERPER_API_KEY;
  return environment;
}

function count(sqlite: Database.Database, table: string): number {
  return sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
}

function seedJob(
  sqlite: Database.Database,
  input: {
    boardId: number | bigint | null;
    dedupeKey: string;
    rawPayload: Record<string, unknown>;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO jobs (
        board_id, ats_type, external_id, dedupe_key, canonical_url, title, locations,
        first_seen_at, last_seen_at, raw_payload, evidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.boardId,
      "greenhouse",
      input.dedupeKey,
      input.dedupeKey,
      `https://boards.greenhouse.io/example/jobs/${input.dedupeKey}`,
      "Director of Engineering",
      JSON.stringify(["Singapore"]),
      Date.parse("2026-08-24T00:00:00.000Z"),
      Date.parse("2026-08-24T00:00:00.000Z"),
      JSON.stringify(input.rawPayload),
      "search-lead",
    );
}

function seedProfile(sqlite: Database.Database): number | bigint {
  const recordedAt = Date.parse("2026-08-24T00:00:00.000Z");
  return sqlite
    .prepare(
      `INSERT INTO search_profiles (
        name, title_terms, location_terms, required_job_terms, excluded_title_terms,
        excluded_location_terms, excluded_description_terms, include_unverified,
        max_age_days, min_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "Asia leadership repair",
      JSON.stringify(["Director of Engineering"]),
      JSON.stringify(["Singapore"]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      0,
      30,
      70,
      recordedAt,
      recordedAt,
    ).lastInsertRowid;
}

function readEvidence(sqlite: Database.Database, dedupeKey: string): string {
  return sqlite
    .prepare("SELECT evidence FROM jobs WHERE dedupe_key = ?")
    .pluck()
    .get(dedupeKey) as string;
}

function readMatchStatus(
  sqlite: Database.Database,
  profileId: number | bigint,
  dedupeKey: string,
): string {
  return sqlite
    .prepare(
      `SELECT job_matches.status
       FROM job_matches
       INNER JOIN jobs ON jobs.id = job_matches.job_id
       WHERE job_matches.profile_id = ? AND jobs.dedupe_key = ?`,
    )
    .pluck()
    .get(profileId, dedupeKey) as string;
}
