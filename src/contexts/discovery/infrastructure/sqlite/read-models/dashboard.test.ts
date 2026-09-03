import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import type { JobListingEvidence } from "@/contexts/discovery/domain/job-listing-provenance";
import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  companyBoards,
  jobMatches,
  jobStates,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { screeningCountColumns } from "@/contexts/discovery/infrastructure/sqlite/screening-count-columns";
import { getDashboardData } from "./dashboard";

const recordedAt = new Date("2026-08-25T12:00:00.000Z");

describe("dashboard screening summary", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => sqlite.close());

  it("counts each active exclusion reason and ignores inactive jobs", () => {
    const profileId = database
      .insert(searchProfiles)
      .values({
        name: "Dashboard fixture",
        titleTerms: ["Engineering"],
        locationTerms: ["United Arab Emirates"],
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
    seedExcludedJob(database, profileId, "active-one", true, [
      { code: "title-mismatch" },
      { code: "location-mismatch" },
      { code: "stale-listing", maximumAgeDays: 30 },
      { code: "unverified-lead" },
      { code: "missing-required-job-term" },
      { code: "salary-above", salary: salaryRange(120_000, null) },
    ]);
    seedExcludedJob(database, profileId, "active-two", true, [
      { code: "excluded-title", term: "Intern" },
      { code: "excluded-location", term: "London" },
      { code: "salary-below", salary: salaryRange(null, 80_000) },
    ]);
    seedExcludedJob(database, profileId, "inactive", false, [
      { code: "title-mismatch" },
      { code: "location-mismatch" },
    ]);

    expect(getDashboardData({ profileId }, database).screened).toEqual({
      total: 2,
      title: 2,
      location: 2,
      stale: 1,
      unverified: 1,
      context: 1,
      salary: 2,
    });
  });

  it("counts enabled company boards as runnable coverage", () => {
    const profileId = database
      .insert(searchProfiles)
      .values({
        name: "Dashboard fixture",
        titleTerms: ["Engineering"],
        locationTerms: ["United Arab Emirates"],
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
    database
      .insert(companyBoards)
      .values({
        atsType: "greenhouse",
        canonicalKey: "greenhouse:example",
        slug: "example",
        baseUrl: "https://boards.greenhouse.io/example",
        config: {},
        enabled: true,
        discoveredAt: recordedAt,
      })
      .run();

    expect(getDashboardData({ profileId }, database).activeBoards).toBe(1);
  });
});

describe("dashboard opportunity payload", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => sqlite.close());

  it("returns only the fields the opportunity interface renders", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "matched-one");

    const [job] = getDashboardData({ profileId }, database).jobs;

    expect(job).toBeDefined();
    expect(Object.keys(job as object).sort()).toEqual([
      "applyUrl",
      "atsType",
      "canonicalUrl",
      "companyName",
      "department",
      "employmentType",
      "firstSeenAt",
      "id",
      "locationText",
      "publishedAt",
      "reasons",
      "salary",
      "score",
      "state",
      "title",
      "verified",
      "workplaceType",
    ]);
  });

  it("derives verification from the evidence the browser no longer receives", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "structured-one", {
      title: "Director of Engineering",
      evidence: "structured",
      score: 90,
    });
    seedMatchedJob(database, profileId, "lead-one", {
      title: "Head of Platform",
      evidence: "search-lead",
      score: 80,
    });

    const jobs = getDashboardData({ profileId }, database).jobs;

    expect(jobs.map((job) => [job.title, job.verified])).toEqual([
      ["Director of Engineering", true],
      ["Head of Platform", false],
    ]);
  });

  it("composes the salary from the columns it stops returning", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "paid-one", {
      title: "Director of Engineering",
      score: 90,
      salaryMin: 90_000,
      salaryMax: 120_000,
    });
    seedMatchedJob(database, profileId, "unpaid-one", {
      title: "Head of Platform",
      score: 80,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
    });

    const jobs = getDashboardData({ profileId }, database).jobs;

    expect(jobs.map((job) => job.salary)).toEqual([
      createAnnualSalaryRange("USD", 90_000, 120_000),
      null,
    ]);
  });

  it("returns the recorded listing state and falls back to new", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "saved-one", {
      title: "Director of Engineering",
      score: 90,
      state: "saved",
    });
    seedMatchedJob(database, profileId, "untouched-one", {
      title: "Head of Platform",
      score: 80,
    });

    const data = getDashboardData({ profileId }, database);

    expect(data.jobs.map((job) => job.state)).toEqual(["saved", "new"]);
    expect(data.counts).toEqual({ matched: 2, new: 1, saved: 1, applied: 0 });
  });

  it("keeps the structured listing when a search-lead duplicate outranks it", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "lead-duplicate", {
      atsType: "linkedin",
      evidence: "search-lead",
      score: 95,
    });
    seedMatchedJob(database, profileId, "structured-duplicate", {
      atsType: "greenhouse",
      evidence: "structured",
      score: 80,
    });

    const data = getDashboardData({ profileId }, database);

    expect(data.jobs.map((job) => job.canonicalUrl)).toEqual([
      "https://example.test/jobs/structured-duplicate",
    ]);
    expect(data.jobs[0]?.verified).toBe(true);
    expect(data.counts.matched).toBe(1);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function salaryRange(min: number | null, max: number | null) {
  const range = createAnnualSalaryRange("USD", min, max);
  if (!range) {
    throw new Error("The salary fixture must be a valid annual range.");
  }
  return range;
}

function seedProfile(database: ReturnType<typeof createDatabase>): number {
  return database
    .insert(searchProfiles)
    .values({
      name: "Dashboard fixture",
      titleTerms: ["Engineering"],
      locationTerms: ["United Arab Emirates"],
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
}

interface MatchedJobFixture {
  readonly atsType?: AtsType;
  readonly evidence?: JobListingEvidence;
  readonly title?: string;
  readonly score?: number;
  readonly salaryCurrency?: string;
  readonly salaryMin?: number | null;
  readonly salaryMax?: number | null;
  readonly state?: JobListingState;
}

function seedMatchedJob(
  database: ReturnType<typeof createDatabase>,
  profileId: number,
  id: string,
  fixture: MatchedJobFixture = {},
): void {
  const jobId = database
    .insert(jobs)
    .values({
      atsType: fixture.atsType ?? "greenhouse",
      externalId: id,
      dedupeKey: id,
      canonicalUrl: `https://example.test/jobs/${id}`,
      applyUrl: `https://example.test/jobs/${id}/apply`,
      companyName: "Example Systems",
      title: fixture.title ?? "Director of Engineering",
      locationText: "Dubai, United Arab Emirates",
      locations: ["United Arab Emirates"],
      description: "A long job description the opportunity interface never renders.",
      department: "Engineering",
      employmentType: "Full-time",
      workplaceType: "Hybrid",
      publishedAt: recordedAt,
      salaryCurrency: fixture.salaryCurrency ?? "USD",
      salaryMin: fixture.salaryMin === undefined ? 90_000 : fixture.salaryMin,
      salaryMax: fixture.salaryMax === undefined ? 120_000 : fixture.salaryMax,
      evidence: fixture.evidence ?? "structured",
      firstSeenAt: recordedAt,
      lastSeenAt: recordedAt,
      isActive: true,
      rawPayload: { provider: "greenhouse", body: "The provider payload the browser never reads." },
    })
    .returning({ id: jobs.id })
    .get().id;
  database
    .insert(jobMatches)
    .values({
      profileId,
      jobId,
      status: "matched",
      score: fixture.score ?? 88,
      reasons: [],
      exclusionReasons: [],
      ...screeningCountColumns([]),
      updatedAt: recordedAt,
    })
    .run();
  if (fixture.state) {
    database
      .insert(jobStates)
      .values({ profileId, jobId, status: fixture.state, notes: "", updatedAt: recordedAt })
      .run();
  }
}

function seedExcludedJob(
  database: ReturnType<typeof createDatabase>,
  profileId: number,
  id: string,
  isActive: boolean,
  exclusionReasons: readonly ExclusionReason[],
): void {
  const jobId = database
    .insert(jobs)
    .values({
      atsType: "greenhouse",
      externalId: id,
      dedupeKey: id,
      canonicalUrl: `https://example.test/jobs/${id}`,
      title: "Engineering role",
      locations: ["United Arab Emirates"],
      evidence: "structured",
      firstSeenAt: recordedAt,
      lastSeenAt: recordedAt,
      isActive,
      rawPayload: {},
    })
    .returning({ id: jobs.id })
    .get().id;
  database
    .insert(jobMatches)
    .values({
      profileId,
      jobId,
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons,
      ...screeningCountColumns(exclusionReasons),
      updatedAt: recordedAt,
    })
    .run();
}
