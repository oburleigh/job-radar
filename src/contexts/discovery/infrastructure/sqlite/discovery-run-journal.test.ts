import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteDiscoveryRunJournal } from "./discovery-run-journal";
import { createSqliteDiscoveryRunRegistry } from "./discovery-run-registry";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("SQLite discovery run journal cancellation guards", () => {
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

  it("does not prepare a reserved run after it was cancelled", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    const reservation = registry.reserve({ profileId, providerName: "serper" });
    registry.cancel({
      runId: reservation.runId,
      message: "Cancelled by user",
      finishedAt: now,
    });
    const journal = createSqliteDiscoveryRunJournal(database);

    expect(() =>
      journal.prepare({
        runId: reservation.runId,
        profileId,
        providerName: "serper",
        queryCount: 1,
        startedAt: now,
      }),
    ).toThrow("The reserved discovery run is invalid");
    expect(
      sqlite.prepare("select status from discovery_runs where id = ?").get(reservation.runId),
    ).toEqual({ status: "cancelled" });
  });

  it("ignores late completion and failure writes after cancellation", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    const reservation = registry.reserve({ profileId, providerName: "serper" });
    registry.cancel({
      runId: reservation.runId,
      message: "Cancelled by user",
      finishedAt: now,
    });
    const journal = createSqliteDiscoveryRunJournal(database);

    journal.complete({
      runId: reservation.runId,
      progress: { hitCount: 4, jobsUpserted: 2, queryErrorCount: 0, syncErrorCount: 0 },
      boardsDiscovered: 1,
      matchesFound: 2,
      errors: [],
      allQueriesFailed: false,
      finishedAt: new Date(now.getTime() + 1_000),
    });
    journal.fail({
      runId: reservation.runId,
      progress: { hitCount: 9, jobsUpserted: 8, queryErrorCount: 1, syncErrorCount: 1 },
      boardsDiscovered: 2,
      matchesFound: 3,
      message: "late failure",
      finishedAt: new Date(now.getTime() + 2_000),
    });

    expect(
      sqlite
        .prepare("select status, error, hit_count, finished_at from discovery_runs where id = ?")
        .get(reservation.runId),
    ).toEqual({
      status: "cancelled",
      error: "Cancelled by user",
      hit_count: 0,
      finished_at: now.getTime(),
    });
  });

  it("terminalizes running child queries and ignores late query writes", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    const reservation = registry.reserve({ profileId, providerName: "serper" });
    const query = database
      .insert(schema.discoveryQueries)
      .values({
        runId: reservation.runId,
        atsType: "greenhouse",
        sourcePattern: "jobs.example.com",
        titleTerm: "Staff Engineer",
        queryText: "site:jobs.example.com Staff Engineer",
        status: "running",
        startedAt: now,
      })
      .returning({ id: schema.discoveryQueries.id })
      .get();
    if (!query) {
      throw new Error("Could not create test query");
    }
    const journal = createSqliteDiscoveryRunJournal(database);

    expect(
      registry.cancel({
        runId: reservation.runId,
        message: "Cancelled by user",
        finishedAt: now,
      }),
    ).toEqual({ status: "cancelled", runId: reservation.runId });
    expect(
      sqlite.prepare("select status from discovery_queries where id = ?").get(query.id),
    ).toEqual({ status: "cancelled" });

    journal.completeQuery(query.id, 4, new Date(now.getTime() + 1_000));
    journal.failQuery(query.id, "late failure", new Date(now.getTime() + 2_000));

    expect(
      sqlite
        .prepare("select status, hit_count, error from discovery_queries where id = ?")
        .get(query.id),
    ).toEqual({ status: "cancelled", hit_count: 0, error: "Cancelled by user" });
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

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
