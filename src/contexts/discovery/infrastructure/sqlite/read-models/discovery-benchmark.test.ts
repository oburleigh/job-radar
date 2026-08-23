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
  companyBoards,
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { readDiscoveryBenchmark } from "./discovery-benchmark";

const benchmarkedAt = new Date("2026-08-23T20:30:00.000Z");
const knownRoleUrl = "https://job-boards.greenhouse.io/xapo61/jobs/7778750003";

describe("discovery benchmark evidence", () => {
  let directory: string;
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-discovery-benchmark-"));
    sqlite = new Database(path.join(directory, "job-radar.sqlite"));
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, new Date("2026-08-23T20:00:00.000Z"));
  });

  afterEach(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("explains a visible known role that entered through board synchronization", () => {
    const { profileId, runId, boardId } = seedRun(database);
    seedHit(database, {
      runId,
      boardId,
      rank: 1,
      title: "Head of Quality Engineering",
      url: "https://job-boards.greenhouse.io/xapo61/jobs/7774837003",
      atsType: "greenhouse",
    });
    seedHit(database, {
      runId,
      boardId: null,
      rank: 2,
      title: "Unclassified result",
      url: "https://example.com/jobs/unknown",
      atsType: null,
    });
    const jobId = seedKnownJob(database, { boardId, evidence: "structured" });
    database
      .insert(jobMatches)
      .values({
        profileId,
        jobId,
        status: "matched",
        score: 87,
        reasons: [{ code: "title-match", term: "Head of Engineering" }, { code: "remote-allowed" }],
        exclusionReasons: [],
        updatedAt: benchmarkedAt,
      })
      .run();

    expect(
      readDiscoveryBenchmark(database, {
        runId,
        profileId,
        knownRoleUrl,
        benchmarkedAt,
        policy: policySnapshot(),
      }),
    ).toEqual({
      benchmarkedAt: benchmarkedAt.toISOString(),
      run: {
        id: runId,
        provider: "brave",
        source: "greenhouse",
        status: "completed",
        counts: {
          plannedQueries: 2,
          successfulQueries: 1,
          failedQueries: 1,
          providerResults: 2,
          uniqueHits: 2,
          classifiedHits: 1,
          unclassifiedHits: 1,
          boardsDiscovered: 1,
          jobsWritten: 11,
          matches: 1,
          syncErrors: 0,
        },
      },
      inputs: {
        profile: {
          id: profileId,
          name: "ADM-17 UAE engineering leadership",
          titleTerms: ["Head of Engineering"],
          locationTerms: ["UAE", "Dubai"],
          requiredJobTerms: [],
          excludedTitleTerms: [],
          excludedLocationTerms: [],
          excludedDescriptionTerms: [],
          includeRemote: true,
          includeUnverified: false,
          salaryCurrency: "",
          salaryMin: null,
          salaryMax: null,
          maxAgeDays: 365,
          minScore: 70,
        },
        policy: policySnapshot(),
      },
      plannedQueries: [
        {
          sourcePattern: "job-boards.greenhouse.io",
          titleTerm: "Head of Engineering (worldwide remote)",
          queryText: "site:job-boards.greenhouse.io remote leadership",
          status: "completed",
          providerResults: 2,
          error: "",
        },
        {
          sourcePattern: "boards.greenhouse.io",
          titleTerm: "Head of Engineering",
          queryText: "site:boards.greenhouse.io UAE leadership",
          status: "failed",
          providerResults: 0,
          error: "Brave Search returned an invalid response",
        },
      ],
      knownRole: {
        requestedUrl: knownRoleUrl,
        canonicalUrl: knownRoleUrl,
        providerResponse: { returned: false, rank: null, query: null },
        classification: { status: "not-returned", atsType: null, boardId: null },
        verification: {
          status: "verified",
          entry: "board-sync",
          active: true,
          evidence: "structured",
          externalId: "7778750003",
          boardTrigger: {
            url: "https://job-boards.greenhouse.io/xapo61/jobs/7774837003",
            rank: 1,
            query: "site:job-boards.greenhouse.io remote leadership",
          },
        },
        match: {
          status: "matched",
          score: 87,
          reasons: [
            { code: "title-match", term: "Head of Engineering" },
            { code: "remote-allowed" },
          ],
          exclusionReasons: [],
        },
        visibleCard: { visible: true, state: "new" },
      },
    });
  });

  it("preserves the typed exclusion reason for a directly returned role", () => {
    const { profileId, runId, boardId } = seedRun(database);
    seedHit(database, {
      runId,
      boardId,
      rank: 3,
      title: "Head of Engineering",
      url: `${knownRoleUrl}?utm_source=search`,
      atsType: "greenhouse",
    });
    const jobId = seedKnownJob(database, { boardId, evidence: "structured" });
    database
      .insert(jobMatches)
      .values({
        profileId,
        jobId,
        status: "excluded",
        score: 0,
        reasons: [],
        exclusionReasons: [{ code: "location-mismatch" }],
        updatedAt: benchmarkedAt,
      })
      .run();

    const report = readDiscoveryBenchmark(database, {
      runId,
      profileId,
      knownRoleUrl,
      benchmarkedAt,
      policy: policySnapshot(),
    });

    expect(report.knownRole).toMatchObject({
      providerResponse: {
        returned: true,
        rank: 3,
        query: "site:job-boards.greenhouse.io remote leadership",
      },
      classification: { status: "classified", atsType: "greenhouse", boardId },
      verification: { status: "verified", entry: "direct-search-hit" },
      match: {
        status: "excluded",
        score: 0,
        reasons: [],
        exclusionReasons: [{ code: "location-mismatch" }],
      },
      visibleCard: { visible: false, state: null },
    });
  });

  it("reports an expected role that never entered the pipeline", () => {
    const { profileId, runId } = seedRun(database);

    const report = readDiscoveryBenchmark(database, {
      runId,
      profileId,
      knownRoleUrl,
      benchmarkedAt,
      policy: policySnapshot(),
    });

    expect(report.knownRole).toEqual({
      requestedUrl: knownRoleUrl,
      canonicalUrl: knownRoleUrl,
      providerResponse: { returned: false, rank: null, query: null },
      classification: { status: "not-returned", atsType: null, boardId: null },
      verification: {
        status: "not-observed",
        entry: "absent",
        active: null,
        evidence: null,
        externalId: "",
        boardTrigger: null,
      },
      match: {
        status: "not-evaluated",
        score: null,
        reasons: [],
        exclusionReasons: [],
      },
      visibleCard: { visible: false, state: null },
    });
  });

  it("distinguishes a stored inactive role from a currently verified listing", () => {
    const { profileId, runId, boardId } = seedRun(database);
    seedKnownJob(database, { boardId, evidence: "structured", isActive: false });

    const report = readDiscoveryBenchmark(database, {
      runId,
      profileId,
      knownRoleUrl,
      benchmarkedAt,
      policy: policySnapshot(),
    });

    expect(report.knownRole.verification).toEqual({
      status: "inactive",
      entry: "preexisting",
      active: false,
      evidence: "structured",
      externalId: "7778750003",
      boardTrigger: null,
    });
    expect(report.knownRole.visibleCard).toEqual({ visible: false, state: null });
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function seedRun(database: ReturnType<typeof createDatabase>) {
  const profileId = database
    .insert(searchProfiles)
    .values({
      name: "ADM-17 UAE engineering leadership",
      titleTerms: ["Head of Engineering"],
      locationTerms: ["UAE", "Dubai"],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: true,
      includeUnverified: false,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 365,
      minScore: 70,
      enabled: true,
      createdAt: benchmarkedAt,
      updatedAt: benchmarkedAt,
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  const runId = database
    .insert(discoveryRuns)
    .values({
      profileId,
      provider: "brave",
      status: "completed",
      queryCount: 2,
      hitCount: 2,
      boardsDiscovered: 1,
      jobsUpserted: 11,
      matchesFound: 1,
      queryErrorCount: 1,
      syncErrorCount: 0,
      error: "Brave Search returned an invalid response",
      startedAt: benchmarkedAt,
      finishedAt: benchmarkedAt,
    })
    .returning({ id: discoveryRuns.id })
    .get().id;
  database
    .insert(discoveryQueries)
    .values([
      {
        runId,
        atsType: "greenhouse",
        sourcePattern: "job-boards.greenhouse.io",
        titleTerm: "Head of Engineering (worldwide remote)",
        queryText: "site:job-boards.greenhouse.io remote leadership",
        status: "completed",
        hitCount: 2,
        error: "",
        startedAt: benchmarkedAt,
        finishedAt: benchmarkedAt,
      },
      {
        runId,
        atsType: "greenhouse",
        sourcePattern: "boards.greenhouse.io",
        titleTerm: "Head of Engineering",
        queryText: "site:boards.greenhouse.io UAE leadership",
        status: "failed",
        hitCount: 0,
        error: "Brave Search returned an invalid response",
        startedAt: benchmarkedAt,
        finishedAt: benchmarkedAt,
      },
    ])
    .run();
  const boardId = database
    .insert(companyBoards)
    .values({
      atsType: "greenhouse",
      canonicalKey: "greenhouse:xapo61",
      companyName: "Xapo Bank",
      slug: "xapo61",
      baseUrl: "https://job-boards.greenhouse.io/xapo61",
      config: {},
      enabled: true,
      discoveredAt: benchmarkedAt,
    })
    .returning({ id: companyBoards.id })
    .get().id;
  return { profileId, runId, boardId };
}

function seedHit(
  database: ReturnType<typeof createDatabase>,
  hit: {
    runId: number;
    boardId: number | null;
    rank: number;
    title: string;
    url: string;
    atsType: "greenhouse" | null;
  },
) {
  database
    .insert(discoveryHits)
    .values({
      ...hit,
      query: "site:job-boards.greenhouse.io remote leadership",
      snippet: "Remote engineering leadership",
      createdAt: benchmarkedAt,
    })
    .run();
}

function seedKnownJob(
  database: ReturnType<typeof createDatabase>,
  values: {
    boardId: number;
    evidence: "structured" | "search-lead";
    isActive?: boolean;
  },
) {
  return database
    .insert(jobs)
    .values({
      boardId: values.boardId,
      atsType: "greenhouse",
      externalId: "7778750003",
      dedupeKey: "known-role",
      canonicalUrl: knownRoleUrl,
      companyName: "Xapo Bank",
      title: "Head of Engineering (Remote - Work from Anywhere)",
      locationText: "Gibraltar - Remote",
      locations: ["Gibraltar - Remote"],
      description: "Work from anywhere",
      evidence: values.evidence,
      firstSeenAt: benchmarkedAt,
      lastSeenAt: benchmarkedAt,
      isActive: values.isActive ?? true,
      rawPayload: {},
    })
    .returning({ id: jobs.id })
    .get().id;
}

function policySnapshot() {
  return {
    resultsPerQuery: 20,
    boardJobLimit: 200,
    searchFreshnessDays: 0,
    titleSearchMode: "title" as const,
    matching: {
      exactTitleScore: 60,
      fullTokenScore: 50,
      partialTokenScore: 42,
      partialTokenThreshold: 0.8,
      locationScore: 30,
      remoteScore: 25,
      unknownDateScore: 5,
      freshnessMaxScore: 10,
      freshnessMinimumScore: 2,
      freshnessStepDays: 3,
      stopWords: ["a", "an", "and", "of", "the", "to"],
      genericTitleTerms: ["head", "vp"],
      remoteTerms: ["remote"],
      unrestrictedRemotePhrases: ["work from anywhere"],
    },
  };
}
