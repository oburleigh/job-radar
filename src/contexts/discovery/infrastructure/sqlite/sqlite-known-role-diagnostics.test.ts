import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { createSqliteKnownRoleDiagnostics } from "./sqlite-known-role-diagnostics";

const observedAt = new Date("2026-08-24T08:00:00.000Z");
const knownRoleUrl = "https://job-boards.greenhouse.io/acme/jobs/123";

describe("SQLite known-role diagnostics", () => {
  let directory: string;
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-known-role-"));
    sqlite = new Database(path.join(directory, "job-radar.sqlite"));
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, observedAt);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("traces a returned and verified role to its location exclusion", () => {
    const { profileId, runId, greenhouseQueryId } = seedRun(database);
    database
      .insert(discoveryHits)
      .values({
        runId,
        query: "site:jobs.lever.co engineering",
        rank: 1,
        title: "Distractor role",
        url: "https://jobs.lever.co/distractor/456",
        snippet: "Unrelated role",
        atsType: "lever",
        boardId: null,
        createdAt: observedAt,
      })
      .run();
    database
      .insert(discoveryHits)
      .values({
        runId,
        query: "site:job-boards.greenhouse.io engineering",
        rank: 3,
        title: "Head of Engineering",
        url: `${knownRoleUrl}?utm_source=search`,
        snippet: "Engineering leadership in Toronto",
        atsType: "greenhouse",
        boardId: null,
        createdAt: observedAt,
      })
      .run();
    seedDistractorJob(database);
    const jobId = seedJob(database, { evidence: "structured", active: true });
    database
      .insert(jobMatches)
      .values({
        profileId,
        jobId,
        status: "excluded",
        score: 0,
        reasons: [],
        exclusionReasons: [{ code: "location-mismatch" }],
        updatedAt: observedAt,
      })
      .run();

    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({ runId, jobUrl: knownRoleUrl }),
    ).toEqual({
      status: "diagnosed",
      requestedUrl: knownRoleUrl,
      canonicalUrl: knownRoleUrl,
      profileId,
      source: { code: "supported-source", atsType: "greenhouse" },
      queryPlan: {
        code: "query-planned",
        queries: [
          {
            id: greenhouseQueryId,
            atsType: "greenhouse",
            sourcePattern: "job-boards.greenhouse.io",
            titleTerm: "Head of Engineering",
            status: "completed",
            providerResults: 1,
          },
        ],
      },
      providerResponse: { code: "provider-returned", rank: 3, queryId: greenhouseQueryId },
      classification: { code: "classified", atsType: "greenhouse" },
      verification: {
        code: "verified",
        storedJob: {
          id: jobId,
          title: "Head of Engineering",
          companyName: "Acme",
          canonicalUrl: knownRoleUrl,
          active: true,
          evidence: "structured",
        },
      },
      matching: {
        code: "excluded",
        score: 0,
        reasons: [],
        exclusionReasons: [{ code: "location-mismatch" }],
      },
    });
  });

  it("shows planned source coverage when a supported ATS URL was never returned", () => {
    const { profileId, runId, greenhouseQueryId } = seedRun(database, 0);
    const missingUrl = "https://job-boards.greenhouse.io/acme/jobs/999";

    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({ runId, jobUrl: missingUrl }),
    ).toEqual({
      status: "diagnosed",
      requestedUrl: missingUrl,
      canonicalUrl: missingUrl,
      profileId,
      source: { code: "supported-source", atsType: "greenhouse" },
      queryPlan: {
        code: "query-planned",
        queries: [
          {
            id: greenhouseQueryId,
            atsType: "greenhouse",
            sourcePattern: "job-boards.greenhouse.io",
            titleTerm: "Head of Engineering",
            status: "completed",
            providerResults: 0,
          },
        ],
      },
      providerResponse: { code: "provider-not-returned" },
      classification: { code: "not-reached" },
      verification: { code: "not-observed", storedJob: null },
      matching: {
        code: "not-evaluated",
        score: null,
        reasons: [],
        exclusionReasons: [],
      },
    });
  });

  it("identifies a returned URL from an unsupported hostname as unclassified", () => {
    const { profileId, runId } = seedRun(database);
    const unsupportedUrl = "https://careers.example.test/jobs/123";
    database
      .insert(discoveryHits)
      .values({
        runId,
        query: "provider query no longer stored",
        rank: 7,
        title: "Unknown result",
        url: unsupportedUrl,
        snippet: "",
        atsType: null,
        boardId: null,
        createdAt: observedAt,
      })
      .run();

    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({ runId, jobUrl: unsupportedUrl }),
    ).toEqual({
      status: "diagnosed",
      requestedUrl: unsupportedUrl,
      canonicalUrl: unsupportedUrl,
      profileId,
      source: { code: "unsupported-source" },
      queryPlan: { code: "no-query-planned", queries: [] },
      providerResponse: { code: "provider-returned", rank: 7, queryId: null },
      classification: { code: "unclassified" },
      verification: { code: "not-observed", storedJob: null },
      matching: {
        code: "not-evaluated",
        score: null,
        reasons: [],
        exclusionReasons: [],
      },
    });
  });

  it("returns a typed absence instead of leaking lookup details for an unknown run", () => {
    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({
        runId: 999,
        jobUrl: knownRoleUrl,
      }),
    ).toEqual({ status: "run-not-found" });
  });

  it("distinguishes an active search lead from structured verification", () => {
    const { runId } = seedRun(database);
    seedJob(database, { evidence: "search-lead", active: true });

    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({ runId, jobUrl: knownRoleUrl }),
    ).toMatchObject({
      verification: {
        code: "unverified",
        storedJob: { active: true, evidence: "search-lead" },
      },
    });
  });

  it("reports an inactive stored listing before considering its evidence source", () => {
    const { runId } = seedRun(database);
    seedJob(database, { evidence: "structured", active: false });

    expect(
      createSqliteKnownRoleDiagnostics(database).diagnose({ runId, jobUrl: knownRoleUrl }),
    ).toMatchObject({
      verification: {
        code: "inactive",
        storedJob: { active: false, evidence: "structured" },
      },
    });
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function seedRun(database: ReturnType<typeof createDatabase>, providerResults = 1) {
  const profileId = database
    .insert(searchProfiles)
    .values({
      name: "ADM-19 diagnosis",
      titleTerms: ["Head of Engineering"],
      locationTerms: ["Dubai"],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: false,
      includeUnverified: false,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 30,
      minScore: 70,
      enabled: true,
      createdAt: observedAt,
      updatedAt: observedAt,
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  const runId = database
    .insert(discoveryRuns)
    .values({
      profileId,
      provider: "serper",
      status: "completed",
      queryCount: 2,
      hitCount: providerResults,
      startedAt: observedAt,
      finishedAt: observedAt,
    })
    .returning({ id: discoveryRuns.id })
    .get().id;
  database
    .insert(discoveryQueries)
    .values({
      runId,
      atsType: "lever",
      sourcePattern: "jobs.lever.co",
      titleTerm: "VP Engineering",
      queryText: "site:jobs.lever.co engineering",
      status: "failed",
      hitCount: 0,
      error: "fixture provider error",
      startedAt: observedAt,
      finishedAt: observedAt,
    })
    .run();
  const greenhouseQueryId = database
    .insert(discoveryQueries)
    .values({
      runId,
      atsType: "greenhouse",
      sourcePattern: "job-boards.greenhouse.io",
      titleTerm: "Head of Engineering",
      queryText: "site:job-boards.greenhouse.io engineering",
      status: "completed",
      hitCount: providerResults,
      error: "",
      startedAt: observedAt,
      finishedAt: observedAt,
    })
    .returning({ id: discoveryQueries.id })
    .get().id;
  return { profileId, runId, greenhouseQueryId };
}

function seedDistractorJob(database: ReturnType<typeof createDatabase>) {
  database
    .insert(jobs)
    .values({
      boardId: null,
      atsType: "lever",
      externalId: "456",
      dedupeKey: "adm-19-distractor-role",
      canonicalUrl: "https://jobs.lever.co/distractor/456",
      companyName: "Distractor",
      title: "VP Engineering",
      locationText: "Dubai",
      locations: ["Dubai"],
      description: "Unrelated role",
      evidence: "structured",
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      isActive: true,
      rawPayload: {},
    })
    .run();
}

function seedJob(
  database: ReturnType<typeof createDatabase>,
  values: { evidence: "structured" | "search-lead"; active: boolean },
) {
  return database
    .insert(jobs)
    .values({
      boardId: null,
      atsType: "greenhouse",
      externalId: "123",
      dedupeKey: "adm-19-known-role",
      canonicalUrl: knownRoleUrl,
      companyName: "Acme",
      title: "Head of Engineering",
      locationText: "Toronto",
      locations: ["Toronto"],
      description: "Engineering leadership",
      evidence: values.evidence,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      isActive: values.active,
      rawPayload: {},
    })
    .returning({ id: jobs.id })
    .get().id;
}
