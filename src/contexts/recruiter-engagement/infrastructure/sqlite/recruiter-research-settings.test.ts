import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import {
  bootstrapRecruiterResearch,
  defaultRecruiterResearchSettings,
} from "./bootstrap-recruiter-research";
import {
  getRecruiterResearchSettings,
  replaceDirectoryMatchWeights,
  replacePublicSearchSettings,
  replaceResearchCriteriaOptions,
} from "./recruiter-research-settings";
import { recruiterResearchSettings } from "./schema";

describe("recruiter research settings", () => {
  it("loads the product defaults from SQLite and preserves an existing operator value", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const firstBootstrapAt = new Date("2026-08-28T00:00:00.000Z");
    bootstrapRecruiterResearch(database, firstBootstrapAt);
    const configured = getRecruiterResearchSettings(database);
    expect(configured.defaultBrief).toEqual({
      criteria: { industries: [], specialisms: [] },
      description: "",
      firmTarget: 10,
      recruiterTarget: 20,
    });
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...configured,
          defaultBrief: { ...configured.defaultBrief, firmTarget: 14, recruiterTarget: 32 },
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database)).toMatchObject({
      defaultBrief: { firmTarget: 14, recruiterTarget: 32 },
      publicSearch: { providerName: "serper", stageRequestLimit: 40 },
    });
  });

  it("replaces the former technology-focused default with an empty research brief", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          directoryMatchWeights: legacyCurrentDirectoryMatchWeights(),
          defaultBrief: formerTechnologyDefaultBrief(),
          execution: { ...legacyExecution(), model: "gpt-5.6-terra", reasoningEffort: "medium" },
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database)).toEqual(defaultRecruiterResearchSettings);
  });

  it("replaces the intermediate account-default technology brief", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          directoryMatchWeights: legacyCurrentDirectoryMatchWeights(),
          defaultBrief: formerTechnologyDefaultBrief(),
          execution: legacyExecution(),
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database)).toEqual(defaultRecruiterResearchSettings);
  });

  it("fails closed when settings have not been bootstrapped", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

    expect(() => getRecruiterResearchSettings(database)).toThrow(
      "Missing recruiter research settings in SQLite",
    );
  });

  it("persists configured directory match weights", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const weights = {
      currentMandatesOrActivity: 10,
      evidenceFreshnessAndQuality: 10,
      namedRecruiterOrTeamEvidence: 10,
      recruiterRoleAndSeniority: 15,
      scaleOrTrackRecord: 10,
      specialism: 20,
      targetMarketOperatingDepth: 25,
    };

    replaceDirectoryMatchWeights(database, weights, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).directoryMatchWeights).toEqual(weights);
  });

  it("persists the provider and public query policy together", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const publicSearch = {
      ...defaultRecruiterResearchSettings.publicSearch,
      providerName: "brave",
      stageRequestLimit: 24,
    };

    replacePublicSearchSettings(database, publicSearch, new Date("2026-08-31T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).publicSearch).toEqual(publicSearch);
  });

  it("persists configured Research criteria catalogues", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const options = {
      industries: ["Technology", "Financial services"],
      specialisms: ["Software engineering", "Data and AI"],
    };

    replaceResearchCriteriaOptions(database, options, new Date("2026-08-31T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).criteriaOptions).toEqual(options);
  });

  it("replaces the former technology-specific public query defaults", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const settings = getRecruiterResearchSettings(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...settings,
          publicSearch: {
            ...settings.publicSearch,
            currentActivityTerms: ["hiring", "vacancies", "jobs", "recruiting", "mandates"],
            excludedHosts: ["clutch.co", "sortlist.com", "agencyspotter.com", "linkedin.com"],
            firmDiscoveryPhrases: [
              "technology recruitment agency",
              "technology recruitment firm",
              "IT recruitment agency",
              "technology executive search",
            ],
          },
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-31T12:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).publicSearch).toEqual(
      defaultRecruiterResearchSettings.publicSearch,
    );
  });

  it("maps legacy ranking factors to the new evidence-backed factors", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const settings = getRecruiterResearchSettings(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...settings,
          directoryMatchWeights: {
            contactability: 10,
            currentActivity: 10,
            evidenceFreshnessAndQuality: 10,
            geographicRelevance: 40,
            recruiterRoleAndSeniority: 10,
            specialism: 20,
          },
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).directoryMatchWeights).toEqual({
      currentMandatesOrActivity: 10,
      evidenceFreshnessAndQuality: 10,
      namedRecruiterOrTeamEvidence: 10,
      recruiterRoleAndSeniority: 10,
      scaleOrTrackRecord: 0,
      specialism: 20,
      targetMarketOperatingDepth: 40,
    });
  });

  it("migrates an intermediate contactability-only ranking row", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const settings = getRecruiterResearchSettings(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...settings,
          directoryMatchWeights: {
            contactability: 5,
            currentActivity: 15,
            evidenceFreshnessAndQuality: 10,
            recruiterRoleAndSeniority: 15,
            specialism: 55,
          },
        },
      })
      .run();

    bootstrapRecruiterResearch(database, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).directoryMatchWeights).toEqual({
      currentMandatesOrActivity: 15,
      evidenceFreshnessAndQuality: 10,
      namedRecruiterOrTeamEvidence: 5,
      recruiterRoleAndSeniority: 15,
      scaleOrTrackRecord: 0,
      specialism: 55,
      targetMarketOperatingDepth: 0,
    });
  });

  it("identifies the invalid field in a corrupted settings row", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const settings = getRecruiterResearchSettings(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...settings,
          publicSearch: { ...settings.publicSearch, resultsPerQuery: 0 },
        },
      })
      .run();

    expect(() => getRecruiterResearchSettings(database)).toThrow(
      "Invalid recruiter research settings: publicSearch.resultsPerQuery",
    );
  });

  it("rejects configured firm targets that cannot provide one recruiter per firm", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapRecruiterResearch(database);
    const settings = getRecruiterResearchSettings(database);
    database
      .update(recruiterResearchSettings)
      .set({
        value: {
          ...settings,
          defaultBrief: { ...settings.defaultBrief, firmTarget: 21, recruiterTarget: 20 },
        },
      })
      .run();

    expect(() => getRecruiterResearchSettings(database)).toThrow(
      "Invalid recruiter research settings: defaultBrief.firmTarget must not exceed the recruiter target",
    );
  });
});

function legacyCurrentDirectoryMatchWeights() {
  return {
    currentActivity: 15,
    evidenceFreshnessAndQuality: 10,
    recruiterRoleAndSeniority: 15,
    specialism: 60,
  };
}

function legacyExecution() {
  return {
    model: null,
    reasoningEffort: null,
    stageRequestLimit: 1,
    stageTimeoutMs: 600_000,
  };
}

function formerTechnologyDefaultBrief() {
  return {
    criteria: {
      industries: ["Financial services", "Technology", "Healthcare", "Retail and e-commerce"],
      specialisms: [
        "Software engineering",
        "Data and AI",
        "Cloud and DevOps",
        "Cybersecurity",
        "Product",
        "Architecture",
        "Technology leadership",
      ],
    },
    description:
      "Research recruitment firms for software engineering, data and AI, cloud and DevOps, cybersecurity, product, architecture, and technology leadership roles.",
    firmTarget: 10,
    recruiterTarget: 20,
  };
}
