import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import { searchProfiles } from "@/contexts/discovery/infrastructure/sqlite/schema";

import { createSqliteDiscoverySetup } from "./sqlite-discovery-setup";

describe("SQLite discovery setup", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, new Date("2026-08-26T00:00:00.000Z"));
  });

  afterEach(() => sqlite.close());

  it("resolves saved country targets and exclusions through the same vocabulary", () => {
    const profileId = seedProfile(database, {
      locationTerms: ["United Arab Emirates"],
      excludedLocationTerms: ["UAE"],
    });

    const setup = createSqliteDiscoverySetup(database).load({
      profileId,
      providerName: "serper",
    });

    const expectedScope = {
      key: "country:AE",
      label: "United Arab Emirates",
      terms: ["United Arab Emirates", "UAE", "Abu Dhabi", "Dubai"],
    };
    expect(setup.profile.markets).toEqual([
      { scope: expectedScope, countryCode: "AE", searchLanguage: "en" },
    ]);
    expect(setup.profile.excludedMarkets).toEqual([
      { scope: expectedScope, countryCode: "AE", searchLanguage: "en" },
    ]);
  });

  it("keeps a saved city target narrow", () => {
    const profileId = seedProfile(database, {
      locationTerms: ["Dubai"],
      excludedLocationTerms: [],
    });

    const setup = createSqliteDiscoverySetup(database).load({
      profileId,
      providerName: "serper",
    });

    expect(setup.profile.markets).toEqual([
      {
        scope: { key: "subdivision:AE-DU", label: "Dubai", terms: ["Dubai"] },
        countryCode: "AE",
        searchLanguage: "en",
      },
    ]);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function seedProfile(
  database: ReturnType<typeof createDatabase>,
  locations: {
    readonly locationTerms: readonly string[];
    readonly excludedLocationTerms: readonly string[];
  },
): number {
  return database
    .insert(searchProfiles)
    .values({
      name: "Market setup",
      titleTerms: ["Head of Engineering"],
      locationTerms: [...locations.locationTerms],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [...locations.excludedLocationTerms],
      excludedDescriptionTerms: [],
      includeRemote: false,
      includeUnverified: true,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 30,
      minScore: 70,
      enabled: true,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    })
    .returning({ id: searchProfiles.id })
    .get().id;
}
