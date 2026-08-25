import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  migrateLegacyExclusionReasons,
  normalizePersistedExclusionReasons,
} from "@/contexts/discovery/infrastructure/sqlite/migrate-legacy-exclusion-reasons";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  discoveryHits,
  discoveryQueries,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { readRunDetail } from "./runs";

const recordedAt = new Date("2026-08-25T12:00:00.000Z");

describe("completed discovery run funnel", () => {
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

  it("counts direct candidates across typed and legacy exclusion reasons", () => {
    const { profileId, runId } = seedRun(database, { hitCount: 8, matchesFound: 1 });

    seedCandidate(database, { runId, profileId, id: "101", outcome: "matched" });
    const verificationOnlyMatchId = seedCandidate(database, {
      runId,
      profileId,
      id: "102",
      evidence: "search-lead",
      outcome: "verification-only",
    });
    seedCandidate(database, { runId, profileId, id: "103", outcome: "stale-only" });
    const otherMatchId = seedCandidate(database, {
      runId,
      profileId,
      id: "104",
      outcome: "other",
    });
    seedCandidate(database, {
      runId,
      profileId,
      id: "105",
      outcome: "verification-and-other",
    });
    database
      .insert(discoveryHits)
      .values([
        {
          runId,
          query: "site:example.com engineering",
          rank: 6,
          title: "Unknown result",
          url: "https://example.com/jobs/unknown",
          snippet: "",
          atsType: null,
          createdAt: recordedAt,
        },
        {
          runId,
          query: "site:boards.greenhouse.io engineering",
          rank: 7,
          title: "Missing stored job",
          url: "https://boards.greenhouse.io/acme/jobs/999",
          snippet: "",
          atsType: "greenhouse",
          createdAt: recordedAt,
        },
        {
          runId,
          query: "site:example.com engineering",
          rank: 8,
          title: "Legacy classified URL",
          url: "https://example.com/jobs/legacy-classification",
          snippet: "",
          atsType: "greenhouse",
          createdAt: recordedAt,
        },
      ])
      .run();

    sqlite
      .prepare("UPDATE job_matches SET exclusion_reasons = ? WHERE id = ?")
      .run(
        JSON.stringify(["Web-search lead is not verified by an ATS feed"]),
        verificationOnlyMatchId,
      );
    sqlite
      .prepare("UPDATE job_matches SET exclusion_reasons = ? WHERE id = ?")
      .run(JSON.stringify(["Location does not match the profile"]), otherMatchId);

    expect(readRunDetail(database, runId)?.funnel).toEqual({
      providerHits: 8,
      classifiedCandidates: 7,
      verifiedJobs: 4,
      verificationOnlyCandidates: 1,
      staleOnlyCandidates: 1,
      otherExclusions: 2,
      finalMatches: 1,
    });
  });

  it("returns the existing query summary in ATS order", () => {
    const { runId } = seedRun(database, { hitCount: 3, matchesFound: 0 });
    database
      .insert(discoveryQueries)
      .values([
        query(runId, "greenhouse", "completed", 2),
        query(runId, "ashby", "failed", 0),
        query(runId, "greenhouse", "failed", 1),
      ])
      .run();

    expect(readRunDetail(database, runId)?.summary).toEqual([
      { atsType: "ashby", queryCount: 1, completedCount: 0, hitCount: 0, errorCount: 1 },
      { atsType: "greenhouse", queryCount: 2, completedCount: 1, hitCount: 3, errorCount: 1 },
    ]);
  });

  it("returns null when the run does not exist", () => {
    expect(readRunDetail(database, 999_999)).toBeNull();
  });

  it("reports a genuine no-hit run without inventing downstream candidates", () => {
    const { runId } = seedRun(database, { hitCount: 0, matchesFound: 0 });

    expect(readRunDetail(database, runId)?.funnel).toEqual({
      providerHits: 0,
      classifiedCandidates: 0,
      verifiedJobs: 0,
      verificationOnlyCandidates: 0,
      staleOnlyCandidates: 0,
      otherExclusions: 0,
      finalMatches: 0,
    });
  });
});

describe("legacy exclusion-reason migration", () => {
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

  it("converts every historical string shape and preserves unknown text", () => {
    const profileId = seedProfileSql(sqlite);
    const jobId = seedJobSql(sqlite);
    const legacyReasons = [
      "Web-search lead is not verified by an ATS feed",
      "Excluded title term: Assistant",
      "Excluded description term: US only",
      "Missing a required job keyword",
      "Title does not match a target role",
      "Excluded location term: Canada",
      "Location does not match the profile",
      "Posted more than 30 days ago",
      "Salary USD 90,000-120,000 is below the preferred range",
      "Salary GBP 180,000+ is above the preferred range",
      "Salary EUR up to 75,000 is below the preferred range",
      "Score is below 70",
      "Historical reason no longer emitted",
      "Prefix Posted more than 30 days ago",
      "Score is below 70 trailing text",
      "Prefix Salary USD 90,000 is below the preferred range",
    ];
    sqlite
      .prepare(
        `INSERT INTO job_matches
          (profile_id, job_id, status, score, reasons, exclusion_reasons, updated_at)
         VALUES (?, ?, 'excluded', 0, '[]', ?, ?)`,
      )
      .run(profileId, jobId, JSON.stringify(legacyReasons), recordedAt.getTime());

    expect(migrateLegacyExclusionReasons(database)).toBe(1);
    expect(migrateLegacyExclusionReasons(database)).toBe(0);

    const row = sqlite.prepare("SELECT exclusion_reasons FROM job_matches").get() as {
      exclusion_reasons: string;
    };
    expect(JSON.parse(row.exclusion_reasons)).toEqual([
      { code: "unverified-lead" },
      { code: "excluded-title", term: "Assistant" },
      { code: "excluded-description", term: "US only" },
      { code: "missing-required-job-term" },
      { code: "title-mismatch" },
      { code: "excluded-location", term: "Canada" },
      { code: "location-mismatch" },
      { code: "stale-listing", maximumAgeDays: 30 },
      { code: "salary-below", salary: { currency: "USD", min: 90000, max: 120000 } },
      { code: "salary-above", salary: { currency: "GBP", min: 180000, max: null } },
      { code: "salary-below", salary: { currency: "EUR", min: null, max: 75000 } },
      { code: "score-below", minimumScore: 70 },
      { code: "legacy", detail: "Historical reason no longer emitted" },
      { code: "legacy", detail: "Prefix Posted more than 30 days ago" },
      { code: "legacy", detail: "Score is below 70 trailing text" },
      { code: "legacy", detail: "Prefix Salary USD 90,000 is below the preferred range" },
    ]);
  });

  it("ignores malformed persisted values without changing typed reasons", () => {
    expect(normalizePersistedExclusionReasons(null)).toEqual([]);
    expect(normalizePersistedExclusionReasons({ code: "title-mismatch" })).toEqual([]);
    expect(
      normalizePersistedExclusionReasons([
        null,
        7,
        { detail: "missing code" },
        { code: 7 },
        { code: "title-mismatch" },
      ]),
    ).toEqual([{ code: "title-mismatch" }]);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function seedRun(
  database: ReturnType<typeof createDatabase>,
  counts: { readonly hitCount: number; readonly matchesFound: number },
) {
  const profileId = database
    .insert(searchProfiles)
    .values({
      name: `Funnel profile ${counts.hitCount}`,
      titleTerms: ["Engineering"],
      locationTerms: ["London"],
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
      createdAt: recordedAt,
      updatedAt: recordedAt,
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  const runId = database
    .insert(discoveryRuns)
    .values({
      profileId,
      provider: "test-provider",
      status: "completed",
      hitCount: counts.hitCount,
      matchesFound: counts.matchesFound,
      startedAt: recordedAt,
      finishedAt: recordedAt,
    })
    .returning({ id: discoveryRuns.id })
    .get().id;
  return { profileId, runId };
}

function seedCandidate(
  database: ReturnType<typeof createDatabase>,
  input: {
    readonly runId: number;
    readonly profileId: number;
    readonly id: string;
    readonly evidence?: "search-lead" | "structured";
    readonly outcome:
      | "matched"
      | "verification-only"
      | "verification-and-other"
      | "stale-only"
      | "other";
  },
): number {
  const url = `https://boards.greenhouse.io/acme/jobs/${input.id}`;
  database
    .insert(discoveryHits)
    .values({
      runId: input.runId,
      query: "site:boards.greenhouse.io engineering",
      rank: Number(input.id),
      title: `Engineering role ${input.id}`,
      url,
      snippet: "",
      atsType: "greenhouse",
      verificationStatus: input.evidence === "search-lead" ? "protected" : "verified",
      verificationUrl: url,
      verificationCheckedAt: recordedAt,
      createdAt: recordedAt,
    })
    .run();
  const jobId = database
    .insert(jobs)
    .values({
      atsType: "greenhouse",
      externalId: input.id,
      dedupeKey: `greenhouse:acme:${input.id}`,
      canonicalUrl: url,
      title: `Engineering role ${input.id}`,
      locations: ["London"],
      evidence: input.evidence ?? "structured",
      firstSeenAt: recordedAt,
      lastSeenAt: recordedAt,
      rawPayload: {},
    })
    .returning({ id: jobs.id })
    .get().id;
  const exclusionReasons =
    input.outcome === "verification-only"
      ? [{ code: "unverified-lead" } as const]
      : input.outcome === "verification-and-other"
        ? ([{ code: "unverified-lead" }, { code: "location-mismatch" }] as const)
        : input.outcome === "stale-only"
          ? [{ code: "stale-listing", maximumAgeDays: 30 } as const]
          : input.outcome === "other"
            ? [{ code: "location-mismatch" } as const]
            : [];
  return database
    .insert(jobMatches)
    .values({
      profileId: input.profileId,
      jobId,
      status: input.outcome === "matched" ? "matched" : "excluded",
      score: input.outcome === "matched" ? 90 : 0,
      reasons: input.outcome === "matched" ? [{ code: "title-match", term: "Engineering" }] : [],
      exclusionReasons,
      updatedAt: recordedAt,
    })
    .returning({ id: jobMatches.id })
    .get().id;
}

function query(
  runId: number,
  atsType: "ashby" | "greenhouse",
  status: "completed" | "failed",
  hitCount: number,
): typeof discoveryQueries.$inferInsert {
  return {
    runId,
    atsType,
    sourcePattern: `${atsType}.example.com`,
    titleTerm: "Engineering",
    queryText: `site:${atsType}.example.com engineering`,
    status,
    hitCount,
    error: status === "failed" ? "fixture failure" : "",
  };
}

function seedProfileSql(sqlite: Database.Database): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO search_profiles
          (name, title_terms, location_terms, required_job_terms, excluded_title_terms,
           excluded_location_terms, excluded_description_terms, include_remote, include_unverified,
           salary_currency, salary_min, salary_max, max_age_days, min_score, enabled, created_at, updated_at)
         VALUES ('Legacy profile', '[]', '[]', '[]', '[]', '[]', '[]', 0, 0, '', NULL, NULL, 30, 70, 1, ?, ?)`,
      )
      .run(recordedAt.getTime(), recordedAt.getTime()).lastInsertRowid,
  );
}

function seedJobSql(sqlite: Database.Database): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO jobs
          (ats_type, external_id, dedupe_key, canonical_url, apply_url, company_name, title,
           location_text, locations, description, department, employment_type, workplace_type,
           published_at, salary_currency, salary_min, salary_max, evidence, first_seen_at,
           last_seen_at, is_active, raw_payload)
         VALUES ('greenhouse', 'legacy', 'legacy', 'https://example.com/legacy', '', '', 'Legacy job',
           '', '[]', '', '', '', '', NULL, '', NULL, NULL, 'structured', ?, ?, 1, '{}')`,
      )
      .run(recordedAt.getTime(), recordedAt.getTime()).lastInsertRowid,
  );
}
