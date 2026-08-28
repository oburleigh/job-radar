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
      execution: { model: null, reasoningEffort: null },
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
          ...defaultRecruiterResearchSettings,
          defaultBrief: formerTechnologyDefaultBrief(),
          execution: {
            ...defaultRecruiterResearchSettings.execution,
            model: "gpt-5.6-terra",
            reasoningEffort: "medium",
          },
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
          ...defaultRecruiterResearchSettings,
          defaultBrief: formerTechnologyDefaultBrief(),
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
      currentActivity: 10,
      evidenceFreshnessAndQuality: 10,
      recruiterRoleAndSeniority: 20,
      specialism: 60,
    };

    replaceDirectoryMatchWeights(database, weights, new Date("2026-08-29T00:00:00.000Z"));

    expect(getRecruiterResearchSettings(database).directoryMatchWeights).toEqual(weights);
  });

  it("moves legacy unavailable ranking weight to specialism", () => {
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
      currentActivity: 10,
      evidenceFreshnessAndQuality: 10,
      recruiterRoleAndSeniority: 10,
      specialism: 70,
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
      currentActivity: 15,
      evidenceFreshnessAndQuality: 10,
      recruiterRoleAndSeniority: 15,
      specialism: 60,
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
      .set({ value: { ...settings, execution: { ...settings.execution, stageTimeoutMs: 0 } } })
      .run();

    expect(() => getRecruiterResearchSettings(database)).toThrow(
      "Invalid recruiter research settings: execution.stageTimeoutMs",
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
