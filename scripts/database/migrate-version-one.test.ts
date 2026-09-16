import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "@/contexts/discovery/infrastructure/sqlite/migrations/coordinator";
import { LEGACY_VERSION_ZERO_FINGERPRINT } from "@/contexts/discovery/infrastructure/sqlite/migrations/current-version";
import { migrateOpportunityTrackingFromVersionOne } from "@/contexts/opportunity-tracking/infrastructure/sqlite/migrate-version-one";
import { initializeVersionZeroDatabase } from "~/tests/support/versioned-database";

describe("Opportunity Tracking database migration", () => {
  const databases: Database.Database[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const sqlite of databases) sqlite.close();
    databases.length = 0;
    for (const directory of temporaryDirectories)
      rmSync(directory, { force: true, recursive: true });
    temporaryDirectories.length = 0;
  });

  it("migrates every legacy applied pair once and retains its Discovery row", async () => {
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("Expected the current schema export.");
    const currentSchemaSql = readFileSync(schemaPath, "utf8");
    const directory = mkdtempSync(path.join(tmpdir(), "job-radar-migrate-v1-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "job-radar.sqlite");
    const sqlite = new Database(databasePath);
    initializeVersionOneSchema(sqlite, currentSchemaSql);
    const profileId = seedProfile(sqlite);
    const appliedJobId = seedJob(sqlite, "applied-job");
    const savedJobId = seedJob(sqlite, "saved-job");
    sqlite
      .prepare(
        "INSERT INTO job_states (profile_id, job_id, status, notes, updated_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      )
      .run(
        profileId,
        appliedJobId,
        "applied",
        "Retain this note",
        17,
        profileId,
        savedJobId,
        "saved",
        "Also retained",
        19,
      );
    sqlite.close();

    const input = {
      databasePath,
      currentSchemaSql,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          sourceFingerprint: LEGACY_VERSION_ZERO_FINGERPRINT,
          migrate: migrateOpportunityTrackingFromVersionOne,
        },
      ],
    } as const;
    await expect(migrateDatabase(input)).resolves.toMatchObject({ status: "migrated", version: 2 });
    await expect(migrateDatabase(input)).resolves.toEqual({
      status: "current",
      version: 2,
      backupPath: null,
    });

    const migrated = new Database(databasePath);
    databases.push(migrated);
    expect(migrated.pragma("user_version", { simple: true })).toBe(2);
    expect(migrated.prepare("SELECT * FROM applications").all()).toEqual([
      expect.objectContaining({
        search_profile_id: profileId,
        job_listing_id: appliedJobId,
        stage: "applied",
        created_at: 17,
        updated_at: 17,
      }),
    ]);
    expect(
      migrated.prepare("SELECT kind, stage, occurred_at FROM application_timeline").all(),
    ).toEqual([{ kind: "application-migrated", stage: "applied", occurred_at: 17 }]);
    expect(migrated.prepare("SELECT status, notes FROM job_states ORDER BY job_id").all()).toEqual([
      { status: "applied", notes: "Retain this note" },
      { status: "saved", notes: "Also retained" },
    ]);
  });
});

function initializeVersionOneSchema(sqlite: Database.Database, currentSchemaSql: string): void {
  initializeVersionZeroDatabase(sqlite, currentSchemaSql);
  sqlite.pragma("user_version = 1");
}

function seedProfile(sqlite: Database.Database): number | bigint {
  return sqlite
    .prepare(
      `INSERT INTO search_profiles (
        name, title_terms, location_terms, excluded_title_terms, excluded_description_terms,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("Migration profile", "[]", "[]", "[]", "[]", 11, 11).lastInsertRowid;
}

function seedJob(sqlite: Database.Database, key: string): number | bigint {
  return sqlite
    .prepare(
      `INSERT INTO jobs (
        ats_type, external_id, dedupe_key, canonical_url, title, locations,
        first_seen_at, last_seen_at, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "greenhouse",
      key,
      key,
      `https://example.test/${key}`,
      "Engineering Director",
      "[]",
      7,
      7,
      "{}",
    ).lastInsertRowid;
}
