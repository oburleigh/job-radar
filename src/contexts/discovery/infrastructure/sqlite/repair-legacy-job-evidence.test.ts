import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hasStaleUnverifiedJobMatches,
  repairLegacyJobEvidence,
} from "./repair-legacy-job-evidence";
import * as schema from "./schema";
import { companyBoards, jobMatches, jobs, searchProfiles } from "./schema";

describe("legacy job evidence repair", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("repairs only board-backed search leads that retain vendor payloads", () => {
    const recordedAt = new Date("2026-08-24T00:00:00.000Z");
    const boardId = seedBoard(database, recordedAt);

    database
      .insert(jobs)
      .values([
        job("legacy-structured", boardId, { id: 8124387, title: "Director of Engineering" }),
        job("search-only", boardId, {}),
        job("verification-only", boardId, {
          verification: {
            status: "unavailable",
            reason: "protected",
            checkedAt: recordedAt.toISOString(),
          },
        }),
        job("off-board-vendor-payload", null, {
          id: 8124388,
          title: "Director of Engineering",
        }),
      ])
      .run();

    expect(repairLegacyJobEvidence(database)).toBe(1);
    expect(repairLegacyJobEvidence(database)).toBe(0);
    expect(
      database
        .select({ dedupeKey: jobs.dedupeKey, evidence: jobs.evidence })
        .from(jobs)
        .orderBy(jobs.dedupeKey)
        .all(),
    ).toEqual([
      { dedupeKey: "legacy-structured", evidence: "structured" },
      { dedupeKey: "off-board-vendor-payload", evidence: "search-lead" },
      { dedupeKey: "search-only", evidence: "search-lead" },
      { dedupeKey: "verification-only", evidence: "search-lead" },
    ]);
  });

  it("detects stale unverified reasons after the evidence update was already committed", () => {
    const recordedAt = new Date("2026-08-24T00:00:00.000Z");
    const boardId = seedBoard(database, recordedAt);
    const profile = database
      .insert(searchProfiles)
      .values({
        name: "Asia leadership repair",
        titleTerms: ["Director of Engineering"],
        locationTerms: ["Singapore"],
        requiredJobTerms: [],
        excludedTitleTerms: [],
        excludedLocationTerms: [],
        excludedDescriptionTerms: [],
        includeUnverified: false,
        maxAgeDays: 30,
        minScore: 70,
        createdAt: recordedAt,
        updatedAt: recordedAt,
      })
      .returning({ id: searchProfiles.id })
      .get();
    const storedJob = database
      .insert(jobs)
      .values({
        ...job("already-repaired", boardId, { id: 8124387 }),
        evidence: "structured",
      })
      .returning({ id: jobs.id })
      .get();
    const match = database
      .insert(jobMatches)
      .values({
        profileId: profile.id,
        jobId: storedJob.id,
        status: "excluded",
        score: 0,
        reasons: [],
        exclusionReasons: [{ code: "unverified-lead" }],
        updatedAt: recordedAt,
      })
      .returning({ id: jobMatches.id })
      .get();

    expect(hasStaleUnverifiedJobMatches(database)).toBe(true);

    sqlite
      .prepare("UPDATE job_matches SET exclusion_reasons = ? WHERE id = ?")
      .run(JSON.stringify(["unverified-lead"]), match.id);
    expect(hasStaleUnverifiedJobMatches(database)).toBe(true);

    sqlite
      .prepare("UPDATE job_matches SET exclusion_reasons = ? WHERE id = ?")
      .run(JSON.stringify([{ code: "location-mismatch" }]), match.id);
    expect(hasStaleUnverifiedJobMatches(database)).toBe(false);

    sqlite
      .prepare("UPDATE job_matches SET exclusion_reasons = ? WHERE id = ?")
      .run(JSON.stringify([{ code: "unverified-lead" }]), match.id);
    sqlite.prepare("UPDATE jobs SET is_active = 0 WHERE id = ?").run(storedJob.id);
    expect(hasStaleUnverifiedJobMatches(database)).toBe(false);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function seedBoard(database: ReturnType<typeof createDatabase>, recordedAt: Date): number {
  return database
    .insert(companyBoards)
    .values({
      atsType: "greenhouse",
      canonicalKey: "greenhouse:example",
      companyName: "Example",
      slug: "example",
      baseUrl: "https://boards.greenhouse.io/example",
      config: {},
      discoveredAt: recordedAt,
    })
    .returning({ id: companyBoards.id })
    .get().id;
}

function job(
  dedupeKey: string,
  boardId: number | null,
  rawPayload: Record<string, unknown>,
): typeof jobs.$inferInsert {
  const recordedAt = new Date("2026-08-24T00:00:00.000Z");
  return {
    boardId,
    atsType: "greenhouse",
    externalId: dedupeKey,
    dedupeKey,
    canonicalUrl: `https://boards.greenhouse.io/example/jobs/${dedupeKey}`,
    title: "Director of Engineering",
    locations: ["Singapore"],
    evidence: "search-lead",
    firstSeenAt: recordedAt,
    lastSeenAt: recordedAt,
    rawPayload,
  };
}
