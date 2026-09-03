import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteDiscoveryRunStatusReader } from "./sqlite-discovery-run-status-reader";

const now = new Date("2026-08-24T14:18:51.000Z");
const staleAfterMs = 300_000;

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
    const reader = createReader(database);

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
    const reader = createReader(database);

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
    const reader = createReader(database);

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

  it("reports a run that stopped sending progress as failed without writing to it", () => {
    const profileId = insertProfile(database);
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        queryCount: 4,
        startedAt: new Date(now.getTime() - 900_000),
        heartbeatAt: new Date(now.getTime() - staleAfterMs - 1),
      })
      .run();

    const result = createReader(database).read({ ids: [1], activeOnly: false });

    expect(result.runs).toEqual([
      expect.objectContaining({
        id: 1,
        status: "failed",
        outcome: "failed",
        errorSummary: "stale-run",
      }),
    ]);
    expect(
      database
        .select({ status: schema.discoveryRuns.status, error: schema.discoveryRuns.error })
        .from(schema.discoveryRuns)
        .get(),
    ).toEqual({ status: "running", error: "" });
  });

  it("answers from the configured timeout rather than a fixed one", () => {
    const profileId = insertProfile(database);
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        startedAt: new Date(now.getTime() - 600_000),
        heartbeatAt: new Date(now.getTime() - 240_000),
      })
      .run();

    expect(createReader(database, 900_000).read({ ids: [1], activeOnly: false }).runs).toEqual([
      expect.objectContaining({ id: 1, status: "running" }),
    ]);
    expect(createReader(database, 60_000).read({ ids: [1], activeOnly: false }).runs).toEqual([
      expect.objectContaining({ id: 1, status: "failed" }),
    ]);
  });

  it("leaves a run that stopped reporting out of the active list, so a reload stops readopting it", () => {
    const profileId = insertProfile(database);
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        startedAt: new Date(now.getTime() - 900_000),
        heartbeatAt: new Date(now.getTime() - staleAfterMs - 1),
      })
      .run();
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        startedAt: new Date(now.getTime() - 900_000),
        heartbeatAt: new Date(now.getTime() - 1_000),
      })
      .run();

    expect(createReader(database).read({ ids: [], activeOnly: true }).runs).toEqual([
      expect.objectContaining({ id: 2, status: "running" }),
    ]);
    expect(createReader(database).read({ ids: [1], activeOnly: false }).runs).toEqual([
      expect.objectContaining({ id: 1, status: "failed" }),
    ]);
  });

  it("reports a run that is still sending progress as running", () => {
    const profileId = insertProfile(database);
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        queryCount: 4,
        startedAt: new Date(now.getTime() - 900_000),
        heartbeatAt: new Date(now.getTime() - 1_000),
      })
      .run();

    expect(createReader(database).read({ ids: [], activeOnly: true }).runs).toEqual([
      expect.objectContaining({ id: 1, status: "running", outcome: "running", errorSummary: "" }),
    ]);
  });
});

function insertProfile(database: ReturnType<typeof createDatabase>): number {
  return database
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
}

function createReader(
  database: ReturnType<typeof createDatabase>,
  timeout: number = staleAfterMs,
  readAt: Date = now,
) {
  return createSqliteDiscoveryRunStatusReader(database, {
    now: () => readAt,
    staleAfterMs: () => timeout,
  });
}

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}
