import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteDiscoveryRunStatusReader } from "./sqlite-discovery-run-status-reader";

const now = new Date("2026-08-24T14:18:51.000Z");

describe("SQLite discovery run status reader", () => {
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

  it("returns only the first recorded failure as the status summary", () => {
    const profileId = database
      .insert(schema.searchProfiles)
      .values({
        name: "Platform leadership",
        titleTerms: ["Staff Engineer"],
        locationTerms: ["Remote"],
        excludedTitleTerms: [],
        excludedDescriptionTerms: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.searchProfiles.id })
      .get().id;
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "failed",
        queryCount: 2,
        queryErrorCount: 2,
        error:
          "jobs.ashbyhq.com / Staff Engineer: Serper.dev returned HTTP 400: Not enough credits\n" +
          "jobs.lever.co / Staff Engineer: Serper.dev returned HTTP 400: Not enough credits",
        startedAt: now,
        heartbeatAt: now,
        finishedAt: now,
      })
      .run();
    const reader = createSqliteDiscoveryRunStatusReader(database);

    const result = reader.read({ ids: [1], activeOnly: false });

    expect(result.runs).toEqual([
      expect.objectContaining({
        id: 1,
        status: "failed",
        outcome: "failed",
        phase: null,
        webCoverageStatus: null,
        errorSummary:
          "jobs.ashbyhq.com / Staff Engineer: Serper.dev returned HTTP 400: Not enough credits",
      }),
    ]);
  });

  it("returns a cancelled run for explicit polling by id", () => {
    const profileId = database
      .insert(schema.searchProfiles)
      .values({
        name: "Cancelled profile",
        titleTerms: ["Staff Engineer"],
        locationTerms: ["Remote"],
        excludedTitleTerms: [],
        excludedDescriptionTerms: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.searchProfiles.id })
      .get().id;
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "cancelled",
        error: "Cancelled by user",
        startedAt: now,
        heartbeatAt: now,
        finishedAt: now,
      })
      .run();
    const reader = createSqliteDiscoveryRunStatusReader(database);

    const result = reader.read({ ids: [1], activeOnly: false });

    expect(result).toEqual({
      runs: [
        expect.objectContaining({
          id: 1,
          status: "cancelled",
          outcome: "cancelled",
          errorSummary: "Cancelled by user",
        }),
      ],
      missingIds: [],
    });
  });

  it("derives a partial outcome from one successful and one failed known board", () => {
    const profileId = database
      .insert(schema.searchProfiles)
      .values({
        name: "Mixed board profile",
        titleTerms: ["Staff Engineer"],
        locationTerms: ["Remote"],
        excludedTitleTerms: [],
        excludedDescriptionTerms: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.searchProfiles.id })
      .get().id;
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "",
        status: "completed",
        phase: "matching",
        knownBoardCount: 2,
        knownBoardCompletedCount: 1,
        knownBoardSuccessCount: 1,
        activeBoardName: "Beta Systems",
        webCoverageStatus: "skipped",
        syncErrorCount: 1,
        startedAt: now,
        heartbeatAt: now,
        finishedAt: now,
      })
      .run();
    const reader = createSqliteDiscoveryRunStatusReader(database);

    expect(reader.read({ ids: [1], activeOnly: false }).runs).toEqual([
      expect.objectContaining({
        id: 1,
        outcome: "partial",
        phase: "matching",
        webCoverageStatus: "skipped",
        knownBoardCount: 2,
        knownBoardCompletedCount: 1,
        knownBoardSuccessCount: 1,
        activeBoardName: "Beta Systems",
      }),
    ]);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}
