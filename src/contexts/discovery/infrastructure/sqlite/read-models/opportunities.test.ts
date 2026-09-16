import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  jobMatches,
  jobStates,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { screeningCountColumns } from "@/contexts/discovery/infrastructure/sqlite/screening-count-columns";
import { initializeTestSchema } from "~/tests/support/current-schema";
import {
  findRankedOpportunity,
  getOpportunitySnapshot,
  listRankedOpportunities,
} from "./opportunities";

const observedAt = new Date("2026-09-14T10:00:00.000Z");

describe("Discovery Opportunity read contract", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;
  let searchProfileId: number;
  let jobListingId: number;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    initializeTestSchema(database);
    searchProfileId = database
      .insert(searchProfiles)
      .values({
        name: "Opportunity contract",
        titleTerms: ["Engineering Director"],
        locationTerms: ["United Kingdom"],
        requiredJobTerms: [],
        excludedTitleTerms: [],
        excludedLocationTerms: [],
        excludedDescriptionTerms: [],
        includeRemote: false,
        includeUnverified: false,
        salaryCurrency: "GBP",
        salaryMin: null,
        salaryMax: null,
        maxAgeDays: 30,
        minScore: 70,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      .returning({ id: searchProfiles.id })
      .get().id;
    jobListingId = database
      .insert(jobs)
      .values({
        atsType: "greenhouse",
        externalId: "role-31",
        dedupeKey: "greenhouse:role-31",
        canonicalUrl: "https://example.test/jobs/role-31",
        applyUrl: "https://example.test/jobs/role-31/apply",
        companyName: "Northstar Systems",
        title: "Engineering Director",
        locationText: "London, United Kingdom",
        locations: ["United Kingdom"],
        description: "Lead the engineering organisation.",
        department: "Engineering",
        employmentType: "Full-time",
        workplaceType: "Hybrid",
        publishedAt: new Date("2026-09-12T09:00:00.000Z"),
        salaryCurrency: "GBP",
        salaryMin: 130_000,
        salaryMax: 160_000,
        evidence: "structured",
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        isActive: true,
        rawPayload: {},
      })
      .returning({ id: jobs.id })
      .get().id;
    database
      .insert(jobMatches)
      .values({
        profileId: searchProfileId,
        jobId: jobListingId,
        status: "matched",
        score: 91,
        reasons: [{ code: "title-match", term: "Engineering Director" }],
        exclusionReasons: [],
        ...screeningCountColumns([]),
        updatedAt: observedAt,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it("orders visible matched listings by score and retains the complete profile identity", () => {
    const original = database.select().from(jobs).get();
    if (!original) throw new Error("Expected the seeded listing");
    const stronger = database
      .insert(jobs)
      .values({
        ...original,
        id: undefined,
        externalId: "stronger",
        dedupeKey: "stronger",
        title: "Higher-ranked role",
      })
      .returning()
      .get();
    const match = database.select().from(jobMatches).get();
    if (!match) throw new Error("Expected the seeded Match");
    database
      .insert(jobMatches)
      .values({ ...match, id: undefined, jobId: stronger.id, score: 97 })
      .run();
    expect(
      listRankedOpportunities(database).map(({ jobListingId, searchProfileId, matchScore }) => ({
        jobListingId,
        searchProfileId,
        matchScore,
      })),
    ).toEqual([
      { jobListingId: stronger.id, searchProfileId, matchScore: 97 },
      { jobListingId, searchProfileId, matchScore: 91 },
    ]);
    database
      .insert(jobStates)
      .values({
        profileId: searchProfileId,
        jobId: stronger.id,
        status: "hidden",
        notes: "",
        updatedAt: observedAt,
      })
      .run();
    expect(listRankedOpportunities(database).map((row) => row.jobListingId)).toEqual([
      jobListingId,
    ]);
    database.update(jobs).set({ isActive: false }).where(eq(jobs.id, jobListingId)).run();
    expect(listRankedOpportunities(database)).toEqual([]);
    database.update(jobs).set({ isActive: true }).where(eq(jobs.id, jobListingId)).run();
    database
      .update(jobMatches)
      .set({ status: "excluded" })
      .where(eq(jobMatches.jobId, jobListingId))
      .run();
    expect(listRankedOpportunities(database)).toEqual([]);
  });

  it("supplies the listing description and its own Search profile criteria", () => {
    const reference = { searchProfileId, jobListingId };
    expect(getOpportunitySnapshot(database, reference)).toMatchObject({
      description: "Lead the engineering organisation.",
      searchCriteria: {
        titleTerms: ["Engineering Director"],
        locationTerms: ["United Kingdom"],
        salaryCurrency: "GBP",
      },
    });
    database
      .update(searchProfiles)
      .set({ titleTerms: ["Platform Lead"], salaryCurrency: "EUR" })
      .where(eq(searchProfiles.id, searchProfileId))
      .run();
    database
      .update(jobs)
      .set({ description: "Own the platform roadmap." })
      .where(eq(jobs.id, jobListingId))
      .run();
    expect(getOpportunitySnapshot(database, reference)).toMatchObject({
      description: "Own the platform roadmap.",
      searchCriteria: { titleTerms: ["Platform Lead"], salaryCurrency: "EUR" },
    });
  });

  it("returns the deterministic Match facts for an active, visible ranked Opportunity", () => {
    expect(findRankedOpportunity(database, { searchProfileId, jobListingId })).toMatchObject({
      searchProfileId,
      jobListingId,
      title: "Engineering Director",
      companyName: "Northstar Systems",
      locationText: "London, United Kingdom",
      canonicalUrl: "https://example.test/jobs/role-31",
      applyUrl: "https://example.test/jobs/role-31/apply",
      listingIsActive: true,
      lastSeenAt: observedAt,
      matchScore: 91,
      matchReasons: [{ code: "title-match", term: "Engineering Director" }],
      verified: true,
    });
  });

  it("does not offer hidden or closed listings for a new Application, but keeps their snapshot readable", () => {
    database
      .insert(jobStates)
      .values({
        profileId: searchProfileId,
        jobId: jobListingId,
        status: "hidden",
        notes: "Not pursuing from Opportunities.",
        updatedAt: observedAt,
      })
      .run();
    expect(findRankedOpportunity(database, { searchProfileId, jobListingId })).toBeNull();

    database.delete(jobStates).run();
    database.update(jobs).set({ isActive: false }).where(eq(jobs.id, jobListingId)).run();
    expect(findRankedOpportunity(database, { searchProfileId, jobListingId })).toBeNull();
    expect(getOpportunitySnapshot(database, { searchProfileId, jobListingId })).toMatchObject({
      jobListingId,
      listingIsActive: false,
      matchScore: 91,
    });
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}
