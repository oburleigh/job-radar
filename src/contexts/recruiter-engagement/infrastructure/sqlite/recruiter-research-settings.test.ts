import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import { bootstrapRecruiterResearch } from "./bootstrap-recruiter-research";
import { getRecruiterResearchSettings } from "./recruiter-research-settings";
import { recruiterResearchSettings } from "./schema";

describe("recruiter research settings", () => {
  it("loads the product defaults from SQLite and preserves an existing operator value", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const firstBootstrapAt = new Date("2026-08-28T00:00:00.000Z");
    bootstrapRecruiterResearch(database, firstBootstrapAt);
    const configured = getRecruiterResearchSettings(database);
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
      execution: { model: "gpt-5.6-terra", reasoningEffort: "medium" },
    });
  });

  it("fails closed when settings have not been bootstrapped", () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

    expect(() => getRecruiterResearchSettings(database)).toThrow(
      "Missing recruiter research settings in SQLite",
    );
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
