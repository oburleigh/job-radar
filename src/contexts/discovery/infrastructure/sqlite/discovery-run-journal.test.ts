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

  it("starts with zero requests and admits each executable request atomically", () => {
    const profileId = insertProfile(database);
    const journal = createSqliteDiscoveryRunJournal(database);
    const run = journal.prepare({
      profileId,
      providerName: "serper",
      startedAt: now,
    });

    expect(
      sqlite.prepare("select query_count from discovery_runs where id = ?").get(run.id),
    ).toEqual({ query_count: 0 });
    expect(
      sqlite
        .prepare("select count(*) as count from discovery_queries where run_id = ?")
        .get(run.id),
    ).toEqual({ count: 0 });

    const admitted = journal.admitRequest(run.id, {
      atsType: "greenhouse",
      sourcePattern: "jobs.example.com",
      titleTerm: "Staff Engineer, Principal Engineer",
      text: "site:jobs.example.com Staff Engineer",
      marketKey: "country:AE",
      countryCode: "AE",
      searchLanguage: "en",
      laneKind: "role",
      strategy: "phrase",
      page: 1,
    });

    expect(admitted).toEqual({
      id: expect.any(Number),
      atsType: "greenhouse",
      sourcePattern: "jobs.example.com",
      titleTerm: "Staff Engineer, Principal Engineer",
      text: "site:jobs.example.com Staff Engineer",
      marketKey: "country:AE",
      countryCode: "AE",
      searchLanguage: "en",
      laneKind: "role",
      strategy: "phrase",
      page: 1,
    });
    expect(
      sqlite.prepare("select query_count from discovery_runs where id = ?").get(run.id),
    ).toEqual({ query_count: 1 });
    expect(
      sqlite
        .prepare(
          `select status, query_text, market_key, country_code, search_language,
                  lane_kind, strategy, page, useful_hit_count, has_more
           from discovery_queries where run_id = ?`,
        )
        .get(run.id),
    ).toEqual({
      status: "planned",
      query_text: "site:jobs.example.com Staff Engineer",
      market_key: "country:AE",
      country_code: "AE",
      search_language: "en",
      lane_kind: "role",
      strategy: "phrase",
      page: 1,
      useful_hit_count: 0,
      has_more: null,
    });
    journal.startQuery(admitted.id, now);
    journal.completeQuery(admitted.id, {
      hitCount: 7,
      usefulHitCount: 3,
      hasMore: true,
      stopReason: "max-pages-per-lane",
      finishedAt: new Date(now.getTime() + 1_000),
    });
    expect(
      sqlite
        .prepare(
          `select status, hit_count, useful_hit_count, has_more, stop_reason
           from discovery_queries where id = ?`,
        )
        .get(admitted.id),
    ).toEqual({
      status: "completed",
      hit_count: 7,
      useful_hit_count: 3,
      has_more: 1,
      stop_reason: "max-pages-per-lane",
    });

    expect(() =>
      journal.admitRequest(run.id + 1_000, {
        atsType: "greenhouse",
        sourcePattern: "jobs.example.com",
        titleTerm: "Principal Engineer",
        text: "site:jobs.example.com Principal Engineer",
        marketKey: null,
        countryCode: null,
        searchLanguage: null,
        laneKind: "role",
        strategy: "phrase",
        page: 1,
      }),
    ).toThrow("The discovery run is not accepting requests");
    expect(
      sqlite
        .prepare("select count(*) as count from discovery_queries where run_id = ?")
        .get(run.id),
    ).toEqual({ count: 1 });

    journal.complete({
      runId: run.id,
      progress: { hitCount: 7, jobsUpserted: 3, queryErrorCount: 0, syncErrorCount: 0 },
      boardsDiscovered: 0,
      matchesFound: 2,
      errors: [],
      allWorkFailed: false,
      budgetStopReason: "max-requests-per-run",
      finishedAt: new Date(now.getTime() + 2_000),
    });
    expect(
      sqlite
        .prepare("select status, budget_stop_reason from discovery_runs where id = ?")
        .get(run.id),
    ).toEqual({ status: "completed", budget_stop_reason: "max-requests-per-run" });
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
        startedAt: now,
      }),
    ).toThrow("The reserved discovery run is invalid");
    expect(
      sqlite.prepare("select status from discovery_runs where id = ?").get(reservation.runId),
    ).toEqual({ status: "cancelled" });
  });

  it("records the active phase and aggregate lane evidence", () => {
    const profileId = insertProfile(database);
    const journal = createSqliteDiscoveryRunJournal(database);
    const run = journal.prepare({
      profileId,
      providerName: null,
      startedAt: now,
    });

    journal.recordPhase(run.id, "known-boards", now);
    journal.recordLaneEvidence(run.id, {
      knownBoardCount: 3,
      knownBoardSuccessCount: 2,
      webCoverageStatus: "skipped",
      progress: { hitCount: 0, jobsUpserted: 7, queryErrorCount: 0, syncErrorCount: 1 },
      recordedAt: now,
    });

    expect(
      sqlite
        .prepare(
          `select phase, known_board_count, known_board_success_count,
                  web_coverage_status, jobs_upserted, sync_error_count
           from discovery_runs where id = ?`,
        )
        .get(run.id),
    ).toEqual({
      phase: "known-boards",
      known_board_count: 3,
      known_board_success_count: 2,
      web_coverage_status: "skipped",
      jobs_upserted: 7,
      sync_error_count: 1,
    });
  });

  it("persists board-by-board progress for polling and reload recovery", () => {
    const profileId = insertProfile(database);
    const journal = createSqliteDiscoveryRunJournal(database);
    const run = journal.prepare({
      profileId,
      providerName: null,
      startedAt: now,
    });

    journal.recordBoardProgress(run.id, {
      totalBoardCount: 5,
      completedBoardCount: 2,
      successfulBoardCount: 1,
      activeBoardName: "Acme Engineering",
      jobsUpserted: 7,
      matchesFound: 3,
      syncErrorCount: 1,
      recordedAt: now,
    });

    expect(
      sqlite
        .prepare(
          `select known_board_count, known_board_completed_count,
                  known_board_success_count, active_board_name,
                  jobs_upserted, matches_found, sync_error_count
           from discovery_runs where id = ?`,
        )
        .get(run.id),
    ).toEqual({
      known_board_count: 5,
      known_board_completed_count: 2,
      known_board_success_count: 1,
      active_board_name: "Acme Engineering",
      jobs_upserted: 7,
      matches_found: 3,
      sync_error_count: 1,
    });
  });

  it("ignores late phase, board progress, and lane evidence after cancellation", () => {
    const profileId = insertProfile(database);
    const registry = createSqliteDiscoveryRunRegistry(database, {
      now: () => now,
      staleAfterMs: () => 300_000,
    });
    const reservation = registry.reserve({ profileId, providerName: null });
    registry.cancel({
      runId: reservation.runId,
      message: "Cancelled by user",
      finishedAt: now,
    });
    const journal = createSqliteDiscoveryRunJournal(database);

    journal.recordPhase(reservation.runId, "web-coverage", now);
    journal.recordBoardProgress(reservation.runId, {
      totalBoardCount: 4,
      completedBoardCount: 3,
      successfulBoardCount: 3,
      activeBoardName: "Late board",
      jobsUpserted: 6,
      matchesFound: 2,
      syncErrorCount: 1,
      recordedAt: now,
    });
    journal.recordLaneEvidence(reservation.runId, {
      knownBoardCount: 4,
      knownBoardSuccessCount: 4,
      webCoverageStatus: "completed",
      progress: { hitCount: 5, jobsUpserted: 6, queryErrorCount: 0, syncErrorCount: 0 },
      recordedAt: now,
    });

    expect(
      sqlite
        .prepare(
          `select status, phase, known_board_count, known_board_completed_count,
                  known_board_success_count, active_board_name,
                  web_coverage_status, jobs_upserted, matches_found
           from discovery_runs where id = ?`,
        )
        .get(reservation.runId),
    ).toEqual({
      status: "cancelled",
      phase: "known-boards",
      known_board_count: 0,
      known_board_completed_count: 0,
      known_board_success_count: 0,
      active_board_name: null,
      web_coverage_status: "pending",
      jobs_upserted: 0,
      matches_found: 0,
    });
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
      allWorkFailed: false,
      budgetStopReason: null,
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

    journal.completeQuery(query.id, {
      hitCount: 4,
      usefulHitCount: 2,
      hasMore: true,
      stopReason: "max-requests-per-run",
      finishedAt: new Date(now.getTime() + 1_000),
    });
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
