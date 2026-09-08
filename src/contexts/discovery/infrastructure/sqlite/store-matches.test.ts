import path from "node:path";
import Database from "better-sqlite3";
import { eq, inArray, type Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import * as schema from "./schema";
import { jobMatches, jobs, searchProfiles } from "./schema";
import { evaluateAndStore } from "./store-matches";

const recordedAt = new Date("2026-09-01T09:00:00.000Z");

// The columns the evaluation reads: `MatchableJob` in `domain/job-match.ts`, plus the identifier
// the match is written against, the evidence that decides verification, and the three salary
// columns the published range is built from.
const columnsTheEvaluationReads = [
  "department",
  "description",
  "evidence",
  "id",
  "location_text",
  "locations",
  "published_at",
  "salary_currency",
  "salary_max",
  "salary_min",
  "title",
  "workplace_type",
];

describe("the listings an evaluation reads", () => {
  let sqlite: Database.Database;
  let recorded: string[];
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    recorded = [];
    database = createDatabase(sqlite, recorded);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database);
  });

  it.each([
    ["United Arab Emirates", "Dubai", "matched", false],
    ["United Kingdom", "London", "matched", true],
    ["United Kingdom", "London, Ontario", "excluded", false],
    ["Canada", "London, Ontario", "matched", false],
    ["Germany", "Berlin", "matched", true],
    ["Japan", "Yokohama", "matched", false],
    ["Australia", "Brisbane", "matched", true],
    ["United Kingdom", "Dubai", "excluded", false],
    ["Dubai, United Arab Emirates", "Abu Dhabi", "excluded", false],
    ["London, England, United Kingdom", "London, Ontario", "excluded", false],
  ])(
    "matches %s against %s using geographic membership",
    async (target, location, status, uncertain) => {
      const profileId = seedProfile(database);
      database
        .update(searchProfiles)
        .set({ locationTerms: [target] })
        .where(eq(searchProfiles.id, profileId))
        .run();
      const jobId = seedListing(database, "geographic-listing");
      database
        .update(jobs)
        .set({ locationText: location, locations: [location] })
        .where(eq(jobs.id, jobId))
        .run();

      await evaluateAndStore(loadProfile(database, profileId), {}, database);

      const match = database.select().from(jobMatches).where(eq(jobMatches.jobId, jobId)).get();
      expect(match?.status).toBe(status);
      expect(match?.reasons.some((reason) => reason.code === "location-uncertain")).toBe(uncertain);
      if (status === "excluded")
        expect(match?.exclusionReasons).toContainEqual({ code: "location-mismatch" });
    },
  );

  it("reads only the columns it evaluates, so the raw payload never enters the heap", async () => {
    const profileId = seedProfile(database);
    seedListing(database, "projected-one");

    recorded.length = 0;
    await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(listingReadColumns(recorded)).toEqual([columnsTheEvaluationReads]);
  });

  it("keeps a selected city narrow when discovery supplies its search aliases", async () => {
    const profileId = seedProfile(database);
    database
      .update(searchProfiles)
      .set({ locationTerms: ["London, England, United Kingdom"] })
      .where(eq(searchProfiles.id, profileId))
      .run();
    const jobId = seedListing(database, "city-alias-listing");
    database
      .update(jobs)
      .set({ locationText: "London, Ontario", locations: ["London"] })
      .where(eq(jobs.id, jobId))
      .run();

    await evaluateAndStore(
      loadProfile(database, profileId),
      { locationTerms: ["London", "London, England, United Kingdom"] },
      database,
    );

    expect(matchesOf(database, profileId)[0]?.exclusionReasons).toContainEqual({
      code: "location-mismatch",
    });
  });

  it("uses an explicit listing country to disambiguate its bare city label", async () => {
    const profileId = seedProfile(database);
    database
      .update(searchProfiles)
      .set({ locationTerms: ["United Kingdom"] })
      .where(eq(searchProfiles.id, profileId))
      .run();
    const jobId = seedListing(database, "explicit-country-listing");
    database
      .update(jobs)
      .set({ locationText: "London, Ontario", locations: ["London"] })
      .where(eq(jobs.id, jobId))
      .run();

    await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(matchesOf(database, profileId)[0]?.exclusionReasons).toContainEqual({
      code: "location-mismatch",
    });
  });

  // Keyset paging is only safe if every batch reads in the same order and stops at the batch size.
  // SQLite happens to scan `jobs_active_id_idx` in id order, so dropping either would leave the
  // behaviour tests green; the statement is the only place the contract is visible.
  it("pages the read in a bounded, stable order", async () => {
    const profileId = seedProfile(database);
    seedListing(database, "ordered-one");

    recorded.length = 0;
    await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(listingReadStatements(recorded)).not.toHaveLength(0);
    for (const statement of listingReadStatements(recorded)) {
      expect(statement).toMatch(/order by "jobs"\."id"/);
      expect(statement).toMatch(/limit \?/);
    }
  });

  it("reads the listings in batches of the size the caller yields on", async () => {
    const profileId = seedProfile(database);
    for (const id of [
      "batched-one",
      "batched-two",
      "batched-three",
      "batched-four",
      "batched-five",
    ]) {
      seedListing(database, id);
    }

    recorded.length = 0;
    await evaluateAndStore(loadProfile(database, profileId), { yieldEvery: 2 }, database);

    expect(listingReadColumns(recorded)).toHaveLength(3);
  });

  it("reads one more batch to learn it has run out when the last batch fills", async () => {
    const profileId = seedProfile(database);
    for (const id of ["exhausting-one", "exhausting-two"]) {
      seedListing(database, id);
    }

    recorded.length = 0;
    await evaluateAndStore(loadProfile(database, profileId), { yieldEvery: 2 }, database);

    expect(listingReadColumns(recorded)).toHaveLength(2);
  });

  it("evaluates the same listings to the same matches whatever the batch size", async () => {
    const oneAtATime = seedProfile(database, "One at a time");
    const allAtOnce = seedProfile(database, "All at once");
    for (const id of ["stable-one", "stable-two", "stable-three", "stable-four", "stable-five"]) {
      seedListing(database, id);
    }

    const single = await evaluateAndStore(
      loadProfile(database, oneAtATime),
      { yieldEvery: 1 },
      database,
    );
    const whole = await evaluateAndStore(
      loadProfile(database, allAtOnce),
      { yieldEvery: 500 },
      database,
    );

    expect(single).toEqual(whole);
    expect(matchesOf(database, oneAtATime)).toEqual(matchesOf(database, allAtOnce));
    expect(matchesOf(database, oneAtATime)).toHaveLength(5);
  });

  it("leaves a listing that closes before its batch is read to the pass that follows", async () => {
    const profileId = seedProfile(database);
    const firstJobId = seedListing(database, "read-first");
    const secondJobId = seedListing(database, "read-second");
    const closingJobId = seedListing(database, "closed-before-it-is-read");
    let batches = 0;

    const summary = await evaluateAndStore(
      loadProfile(database, profileId),
      {
        yieldEvery: 1,
        beforeBatch: () => {
          batches += 1;
          if (batches === 1) {
            database.update(jobs).set({ isActive: false }).where(eq(jobs.id, closingJobId)).run();
          }
        },
      },
      database,
    );

    expect(summary.evaluated).toBe(2);
    expect(matchesOf(database, profileId).map((match) => match.jobId)).toEqual([
      firstJobId,
      secondJobId,
    ]);
  });

  // The empty path returns before the loop, so the configuration read is the only thing proving it
  // still validates settings rather than reporting a quiet success on a database with nothing in it.
  it("reads its configuration even when no listing is active", async () => {
    const profileId = seedProfile(database);
    seedListing(database, "the-only-listing-and-it-is-closed", { isActive: false });
    recorded.length = 0;

    const summary = await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(summary).toEqual({ evaluated: 0, matched: 0, excluded: 0 });
    expect(recorded.filter((query) => query.includes('from "app_settings"'))).toHaveLength(1);
    expect(listingReadStatements(recorded)).toHaveLength(0);
  });

  it("evaluates the listings active when the pass began and leaves the rest to the next pass", async () => {
    const profileId = seedProfile(database);
    const closedBelowJobId = seedListing(database, "closed-below-the-active-pair", {
      isActive: false,
    });
    const firstJobId = seedListing(database, "active-at-the-start");
    const secondJobId = seedListing(database, "also-active-at-the-start");
    const closedAboveJobId = seedListing(database, "closed-above-the-active-pair", {
      isActive: false,
    });
    let batches = 0;

    const summary = await evaluateAndStore(
      loadProfile(database, profileId),
      {
        yieldEvery: 1,
        onBatch: () => {
          batches += 1;
          if (batches === 1) {
            database
              .update(jobs)
              .set({ isActive: true })
              .where(inArray(jobs.id, [closedBelowJobId, closedAboveJobId]))
              .run();
            seedListing(database, "inserted-while-the-pass-yielded");
          }
        },
      },
      database,
    );

    expect(closedBelowJobId).toBeLessThan(firstJobId);
    expect(closedAboveJobId).toBeGreaterThan(secondJobId);
    expect(summary.evaluated).toBe(2);
    expect(matchesOf(database, profileId).map((match) => match.jobId)).toEqual([
      firstJobId,
      secondJobId,
    ]);
  });
});

function createDatabase(sqlite: Database.Database, recorded: string[]) {
  const logger: Logger = {
    logQuery: (query) => {
      recorded.push(query);
    },
  };
  return drizzle(sqlite, { schema, logger });
}

// The projection is the point of the assertion, so the recorded SQL is read rather than the row
// shape: a row shape cannot tell a named column list from `select()` over the whole table.
function listingReadColumns(recorded: readonly string[]): string[][] {
  return listingReadStatements(recorded).map((query) =>
    (/^select (?<columns>.+?) from "jobs"/.exec(query)?.groups?.columns ?? "")
      .split(", ")
      .map((column) => column.replace(/^"jobs"\./, "").replaceAll('"', ""))
      .sort(),
  );
}

// The ceiling read is `select max("id") from "jobs"`, and setup queries may add others, so the
// listing read is identified by a column only its projection asks for rather than by its table.
function listingReadStatements(recorded: readonly string[]): string[] {
  return recorded.filter((query) => /^select .*"title".* from "jobs"/.test(query));
}

function matchesOf(database: ReturnType<typeof createDatabase>, profileId: number) {
  return database
    .select({
      jobId: jobMatches.jobId,
      status: jobMatches.status,
      score: jobMatches.score,
      exclusionReasons: jobMatches.exclusionReasons,
    })
    .from(jobMatches)
    .where(eq(jobMatches.profileId, profileId))
    .orderBy(jobMatches.jobId)
    .all();
}

function loadProfile(database: ReturnType<typeof createDatabase>, profileId: number) {
  const profile = database
    .select()
    .from(searchProfiles)
    .where(eq(searchProfiles.id, profileId))
    .get();
  if (!profile) {
    throw new Error("The profile fixture must exist.");
  }
  return profile;
}

function seedProfile(
  database: ReturnType<typeof createDatabase>,
  name = "Listing read fixture",
): number {
  return database
    .insert(searchProfiles)
    .values({
      name,
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

function seedListing(
  database: ReturnType<typeof createDatabase>,
  id: string,
  activity: { readonly isActive: boolean } = { isActive: true },
): number {
  return database
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
      isActive: activity.isActive,
      rawPayload: { description: "a payload the evaluation never reads" },
    })
    .returning({ id: jobs.id })
    .get().id;
}
