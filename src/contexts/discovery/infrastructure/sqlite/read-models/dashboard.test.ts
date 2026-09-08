import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { JobListingEvidence } from "@/contexts/discovery/domain/job-listing-provenance";
import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";
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

describe("dashboard read model", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => sqlite.close());

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
    seedMatchedJob(database, profileId, "sterling-one", {
      title: "Director of Engineering",
      score: 90,
      salaryCurrency: "GBP",
      salaryMin: 70_000,
      salaryMax: 95_000,
    });
    seedMatchedJob(database, profileId, "dollar-one", {
      title: "Head of Platform",
      score: 80,
      salaryCurrency: "USD",
      salaryMin: 120_000,
      salaryMax: 150_000,
    });
    seedMatchedJob(database, profileId, "unpaid-one", {
      title: "Principal Engineer",
      score: 70,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
    });

    const jobs = getDashboardData({ profileId }, database).jobs;

    expect(jobs.map((job) => job.salary)).toEqual([
      { currency: "GBP", min: 70_000, max: 95_000 },
      { currency: "USD", min: 120_000, max: 150_000 },
      null,
    ]);
  });

  it("returns each recorded listing state and falls back to new", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "saved-one", {
      title: "Director of Engineering",
      score: 90,
      state: "saved",
    });
    seedMatchedJob(database, profileId, "applied-one", {
      title: "Head of Platform",
      score: 80,
      state: "applied",
    });
    seedMatchedJob(database, profileId, "untouched-one", {
      title: "Principal Engineer",
      score: 70,
    });

    const data = getDashboardData({ profileId }, database);

    expect(data.jobs.map((job) => job.state)).toEqual(["saved", "applied", "new"]);
    expect(data.counts).toEqual({ matched: 3, new: 1, saved: 1, applied: 1 });
  });

  it("withholds a hidden listing until the hidden filter asks for it", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "hidden-one", {
      title: "Director of Engineering",
      score: 90,
      state: "hidden",
    });
    seedMatchedJob(database, profileId, "visible-one", {
      title: "Head of Platform",
      score: 80,
    });

    const visible = getDashboardData({ profileId }, database);
    const hidden = getDashboardData({ profileId, state: "hidden" }, database);

    expect(visible.jobs.map((job) => job.title)).toEqual(["Head of Platform"]);
    expect(visible.counts).toEqual({ matched: 1, new: 1, saved: 0, applied: 0 });
    expect(hidden.jobs.map((job) => job.title)).toEqual(["Director of Engineering"]);
  });

  it("prefers structured evidence over a duplicate from the more authoritative source", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "primary-lead", {
      atsType: "greenhouse",
      evidence: "search-lead",
      score: 95,
    });
    seedMatchedJob(database, profileId, "secondary-structured", {
      atsType: "linkedin",
      evidence: "structured",
      score: 80,
    });

    const data = getDashboardData({ profileId }, database);

    expect(data.jobs.map((job) => job.canonicalUrl)).toEqual([
      "https://example.test/jobs/secondary-structured",
    ]);
    expect(data.jobs[0]?.verified).toBe(true);
    expect(data.counts.matched).toBe(1);
  });

  it("prefers the more authoritative source when duplicates carry the same evidence", () => {
    const profileId = seedProfile(database);
    seedMatchedJob(database, profileId, "secondary-first", {
      atsType: "linkedin",
      evidence: "structured",
      score: 95,
    });
    seedMatchedJob(database, profileId, "primary-second", {
      atsType: "greenhouse",
      evidence: "structured",
      score: 80,
    });

    const data = getDashboardData({ profileId }, database);

    expect(data.jobs.map((job) => job.canonicalUrl)).toEqual([
      "https://example.test/jobs/primary-second",
    ]);
    expect(data.counts.matched).toBe(1);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
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
