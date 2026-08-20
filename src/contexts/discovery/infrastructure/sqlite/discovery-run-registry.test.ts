import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteDiscoveryRunRegistry } from "./discovery-run-registry";

const now = new Date("2026-08-20T09:00:00.000Z");

describe("SQLite discovery run registry", () => {
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

  it("creates a running discovery run for an existing profile", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });

    const result = registry.reserve({ profileId, providerName: "serper" });

    expect(result).toEqual({ status: "created", runId: 1 });
    expect(sqlite.prepare("select * from discovery_runs where id = 1").get()).toMatchObject({
      profile_id: profileId,
      provider: "serper",
      status: "running",
      started_at: now.getTime(),
      heartbeat_at: now.getTime(),
    });
  });

  it("returns the active run instead of creating another one", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    registry.reserve({ profileId, providerName: "serper" });

    const result = registry.reserve({ profileId, providerName: "serper" });

    expect(result).toEqual({ status: "already-running", runId: 1 });
    expect(sqlite.prepare("select count(*) as count from discovery_runs").get()).toEqual({
      count: 1,
    });
  });

  it("fails a stale run before reserving its replacement", () => {
    const profileId = insertProfile(database);
    const staleTime = new Date(now.getTime() - 300_001);
    database
      .insert(schema.discoveryRuns)
      .values({
        profileId,
        provider: "serper",
        status: "running",
        startedAt: staleTime,
        heartbeatAt: staleTime,
      })
      .run();
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });

    const result = registry.reserve({ profileId, providerName: "serper" });

    expect(result).toEqual({ status: "created", runId: 2 });
    expect(
      sqlite.prepare("select status, error, finished_at from discovery_runs where id = 1").get(),
    ).toEqual({
      status: "failed",
      error:
        "The local app stopped receiving progress from this discovery. Start a new run to retry.",
      finished_at: now.getTime(),
    });
  });

  it("records an execution failure only while the run is active", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    const reservation = registry.reserve({ profileId, providerName: "serper" });
    const finishedAt = new Date("2026-08-20T09:01:00.000Z");

    registry.fail({ runId: reservation.runId, message: "Search timed out", finishedAt });
    registry.fail({ runId: reservation.runId, message: "Late duplicate", finishedAt });

    expect(
      sqlite
        .prepare("select status, error, finished_at from discovery_runs where id = ?")
        .get(reservation.runId),
    ).toEqual({
      status: "failed",
      error: "Search timed out",
      finished_at: finishedAt.getTime(),
    });
  });

  it("rejects a run for a missing search profile", () => {
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });

    expect(() => registry.reserve({ profileId: 99, providerName: "serper" })).toThrow(
      "Search profile 99 was not found",
    );
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function insertProfile(database: ReturnType<typeof createDatabase>): number {
  return database
    .insert(schema.searchProfiles)
    .values({
      name: "UAE engineering leadership",
      titleTerms: ["VP Engineering"],
      locationTerms: ["Dubai"],
      excludedTitleTerms: [],
      excludedDescriptionTerms: [],
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.searchProfiles.id })
    .get().id;
}
