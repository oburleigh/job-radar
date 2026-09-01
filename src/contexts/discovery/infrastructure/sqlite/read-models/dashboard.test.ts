import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  companyBoards,
  jobMatches,
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
