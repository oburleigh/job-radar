import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import type { StoredOpportunityAssessment } from "@/contexts/opportunity-tracking/application/advisor-workflow";
import * as schema from "./schema";
import { createSqliteAssessmentStore } from "./sqlite-assessment-store";

describe("Opportunity assessment persistence", () => {
  const openDatabases: Database.Database[] = [];

  afterEach(() => {
    for (const sqlite of openDatabases) sqlite.close();
    openDatabases.length = 0;
  });

  it("round-trips the newest assessment for one Opportunity without persistence fields", () => {
    const store = createStore(openDatabases);
    const older = assessment({
      summary: { text: "Earlier assessment", evidenceUrls: ["https://example.test/jobs/11"] },
      createdAt: new Date("2026-09-14T08:00:00.000Z"),
    });
    const otherOpportunity = assessment({
      jobListingId: 12,
      summary: { text: "Different Opportunity", evidenceUrls: ["https://example.test/jobs/11"] },
      createdAt: new Date("2026-09-14T10:00:00.000Z"),
    });
    const latest = assessment({
      summary: { text: "Current assessment", evidenceUrls: ["https://example.test/jobs/11"] },
      strengths: [
        { text: "Title and location align.", evidenceUrls: ["https://example.test/jobs/11"] },
      ],
      gaps: [
        { text: "Reporting line remains unknown.", evidenceUrls: ["https://example.test/jobs/11"] },
      ],
      createdAt: new Date("2026-09-14T09:00:00.000Z"),
    });

    store.save(older);
    store.save(otherOpportunity);
    store.save(latest);

    expect(store.latest({ searchProfileId: 7, jobListingId: 11 })).toEqual(latest);
    expect(store.latest({ searchProfileId: 7, jobListingId: 12 })).toEqual(otherOpportunity);
    expect(store.latest({ searchProfileId: 8, jobListingId: 11 })).toBeUndefined();
  });

  it("uses insertion order as the stable tie-breaker for equal assessment times", () => {
    const store = createStore(openDatabases);
    const createdAt = new Date("2026-09-14T09:00:00.000Z");
    store.save(
      assessment({
        summary: { text: "First reply", evidenceUrls: ["https://example.test/jobs/11"] },
        createdAt,
      }),
    );
    const second = assessment({
      summary: { text: "Second reply", evidenceUrls: ["https://example.test/jobs/11"] },
      createdAt,
    });
    store.save(second);

    expect(store.latest({ searchProfileId: 7, jobListingId: 11 })).toEqual(second);
  });
});

function createStore(openDatabases: Database.Database[]) {
  const sqlite = new Database(":memory:");
  openDatabases.push(sqlite);
  const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
  if (!schemaPath) throw new Error("The test schema path was not configured");
  sqlite.exec(readFileSync(schemaPath, "utf8"));
  return createSqliteAssessmentStore(drizzle(sqlite, { schema }));
}

function assessment(
  overrides: Partial<StoredOpportunityAssessment> = {},
): StoredOpportunityAssessment {
  return {
    searchProfileId: 7,
    jobListingId: 11,
    summary: {
      text: "Strong alignment with one evidence gap.",
      evidenceUrls: ["https://example.test/jobs/11"],
    },
    strengths: [{ text: "The title matches.", evidenceUrls: ["https://example.test/jobs/11"] }],
    gaps: [
      { text: "The reporting line is not stated.", evidenceUrls: ["https://example.test/jobs/11"] },
    ],
    evidence: [
      {
        sourceUrl: "https://example.test/jobs/11",
        excerpt: "Engineering Director",
      },
    ],
    recommendations: [
      {
        title: "Confirm the reporting line",
        reason: "The listing does not state it.",
        evidenceUrls: ["https://example.test/jobs/11"],
      },
    ],
    model: "test-model",
    reasoningEffort: "high",
    policyVersion: 3,
    schemaVersion: 2,
    evidenceCutoff: new Date("2026-09-14T07:55:00.000Z"),
    createdAt: new Date("2026-09-14T08:00:00.000Z"),
    ...overrides,
  };
}
