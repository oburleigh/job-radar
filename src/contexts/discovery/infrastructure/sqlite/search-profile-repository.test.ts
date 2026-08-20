import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currencyFrom } from "@/contexts/discovery/domain/currency";
import {
  createSearchProfileDefinition,
  type SearchProfileDefinition,
  type SearchProfileDraft,
} from "@/contexts/discovery/domain/search-profile";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import { createSqliteSearchProfileRepository } from "./search-profile-repository";

describe("SQLite search profile repository", () => {
  let sqlite: Database.Database;
  let repository: ReturnType<typeof createSqliteSearchProfileRepository>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    repository = createSqliteSearchProfileRepository(database);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("round-trips the profile vocabulary through the SQLite schema", () => {
    const createdAt = new Date("2026-08-20T09:00:00.000Z");
    const profile = profileDefinition();

    const id = repository.insert(profile, createdAt);

    expect(repository.findIdByName(profile.name)).toBe(id);
    expect(sqlite.prepare("select * from search_profiles where id = ?").get(id)).toEqual({
      id,
      name: "UAE engineering leadership",
      enabled: 1,
      title_terms: '["VP Engineering","Head of Engineering"]',
      location_terms: '["Dubai","Abu Dhabi"]',
      required_job_terms: '["Software"]',
      excluded_title_terms: '["Assistant"]',
      excluded_location_terms: '["United States"]',
      excluded_description_terms: '["Security clearance"]',
      include_remote: 1,
      include_unverified: 0,
      salary_currency: "GBP",
      salary_min: 100_000,
      salary_max: 150_000,
      max_age_days: 30,
      min_score: 70,
      created_at: createdAt.getTime(),
      updated_at: createdAt.getTime(),
    });
  });

  it("updates an existing profile without replacing its creation time", () => {
    const createdAt = new Date("2026-08-19T09:00:00.000Z");
    const updatedAt = new Date("2026-08-20T09:00:00.000Z");
    const id = repository.insert(profileDefinition(), createdAt);

    repository.update(
      id,
      profileDefinition({
        name: "Updated leadership search",
        salaryPreference: { currency: null, minimumAnnual: null, maximumAnnual: null },
      }),
      updatedAt,
    );

    expect(repository.findIdByName("UAE engineering leadership")).toBeUndefined();
    expect(repository.findIdByName("Updated leadership search")).toBe(id);
    expect(
      sqlite
        .prepare(
          "select created_at, updated_at, salary_currency, salary_min, salary_max from search_profiles where id = ?",
        )
        .get(id),
    ).toEqual({
      created_at: createdAt.getTime(),
      updated_at: updatedAt.getTime(),
      salary_currency: "",
      salary_min: null,
      salary_max: null,
    });
  });
});

function profileDefinition(overrides: Partial<SearchProfileDraft> = {}): SearchProfileDefinition {
  const result = createSearchProfileDefinition({
    name: "UAE engineering leadership",
    targetTitles: ["VP Engineering", "Head of Engineering"],
    targetLocations: ["Dubai", "Abu Dhabi"],
    requiredJobTerms: ["Software"],
    excludedTitleTerms: ["Assistant"],
    excludedLocationTerms: ["United States"],
    excludedDescriptionTerms: ["Security clearance"],
    includeRemote: true,
    includeUnverified: false,
    salaryPreference: {
      currency: currencyFrom("GBP"),
      minimumAnnual: 100_000,
      maximumAnnual: 150_000,
    },
    maximumAgeDays: 30,
    minimumScore: 70,
    ...overrides,
  });
  if (result.status === "invalid") {
    throw new Error(`Invalid profile fixture: ${result.reason}`);
  }
  return result.profile;
}
