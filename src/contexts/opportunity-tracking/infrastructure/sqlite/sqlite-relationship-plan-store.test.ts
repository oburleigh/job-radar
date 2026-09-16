import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import type { StoredRelationshipPlan } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import * as schema from "./schema";

describe("Relationship plan persistence", () => {
  const openDatabases: Database.Database[] = [];

  afterEach(() => {
    for (const sqlite of openDatabases) sqlite.close();
    openDatabases.length = 0;
  });

  it("returns the newest application-specific plan without persistence fields", async () => {
    const { createSqliteRelationshipPlanStore } = await import("./sqlite-relationship-plan-store");
    const sqlite = new Database(":memory:");
    openDatabases.push(sqlite);
    sqlite.pragma("foreign_keys = ON");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("The test schema path was not configured");
    sqlite.exec(readFileSync(schemaPath, "utf8"));
    const database = drizzle(sqlite, { schema });
    database
      .insert(schema.applications)
      .values([application(41, 11), application(42, 12)])
      .run();
    const store = createSqliteRelationshipPlanStore(database);
    store.save(plan({ summary: "Earlier plan" }));
    const other = plan({ applicationId: 42, summary: "Another Application" });
    store.save(other);
    const latest = plan({
      summary: "Current plan",
      createdAt: new Date("2026-09-14T13:00:00.000Z"),
    });
    store.save(latest);

    expect(store.latest(41)).toEqual(latest);
    expect(store.latest(42)).toEqual(other);
    expect(store.latest(999)).toBeUndefined();
  });
});

function application(id: number, jobListingId: number) {
  return {
    id,
    searchProfileId: 7,
    jobListingId,
    stage: "preparing" as const,
    createdAt: new Date("2026-09-14T08:00:00.000Z"),
    updatedAt: new Date("2026-09-14T08:00:00.000Z"),
  };
}

function plan(overrides: Partial<StoredRelationshipPlan> = {}): StoredRelationshipPlan {
  return {
    applicationId: 41,
    summary: "Use the existing Prospect first.",
    prospectReferences: [
      {
        shortlistId: "shortlist-1",
        recruiterId: "recruiter-7",
        reason: "Relevant function.",
        evidenceUrls: ["https://example.test/evidence/alex"],
      },
    ],
    publicPeople: [],
    recommendations: [],
    model: "test-model",
    reasoningEffort: "high",
    policyVersion: 3,
    schemaVersion: 2,
    evidenceCutoff: new Date("2026-09-14T11:55:00.000Z"),
    createdAt: new Date("2026-09-14T12:00:00.000Z"),
    ...overrides,
  };
}
