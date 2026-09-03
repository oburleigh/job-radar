import path from "node:path";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { backfillJobMatchListingActivity } from "./backfill-listing-activity";
import { getDashboardData } from "./read-models/dashboard";
import * as schema from "./schema";
import { jobMatches, jobs, searchProfiles } from "./schema";
import { screeningCountColumns } from "./screening-count-columns";
import { evaluateAndStore } from "./store-matches";

const recordedAt = new Date("2026-09-01T09:00:00.000Z");

describe("listing activity denormalised onto job matches", () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    database = createDatabase(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("follows a listing out of the screening summary when it closes and back when it reopens", () => {
    const profileId = seedProfile(database);
    const jobId = seedExcludedMatch(database, profileId, "closing-one");
    seedExcludedMatch(database, profileId, "staying-one");

    expect(screenedTotal(database, profileId)).toBe(2);

    setListingActivity(database, jobId, false);
    expect(screenedTotal(database, profileId)).toBe(1);

    setListingActivity(database, jobId, true);
    expect(screenedTotal(database, profileId)).toBe(2);
  });

  it("writes nothing when a re-sighting sets a listing's activity to what it already was", () => {
    const jobId = seedExcludedMatch(database, seedProfile(database, "One"), "resighted-one");
    seedMatchFor(database, seedProfile(database, "Two"), jobId);
    seedMatchFor(database, seedProfile(database, "Three"), jobId);

    const before = totalChanges(sqlite);
    database
      .update(jobs)
      .set({ lastSeenAt: recordedAt, isActive: true })
      .where(eq(jobs.id, jobId))
      .run();

    expect(totalChanges(sqlite) - before).toBe(1);
    expect(listingActivityFlags(database)).toEqual([true, true, true]);
  });

  it("flags what an evaluation writes as active without waiting for the trigger", async () => {
    bootstrapJobRadar(database);
    const profileId = seedProfile(database);
    seedListing(database, "evaluated-one");
    await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(listingActivityFlags(database)).toEqual([true]);
  });

  it("records a listing that closes while the evaluation still has it in hand", async () => {
    bootstrapJobRadar(database);
    const profileId = seedProfile(database);
    const closingJobId = seedListing(database, "closing-mid-run");
    const stayingJobId = seedListing(database, "staying-open");
    let batches = 0;

    await evaluateAndStore(
      loadProfile(database, profileId),
      {
        yieldEvery: 1,
        beforeBatch: () => {
          batches += 1;
          if (batches === 1) {
            setListingActivity(database, closingJobId, false);
          }
        },
      },
      database,
    );

    expect(
      database
        .select({ jobId: jobMatches.jobId, listingIsActive: jobMatches.listingIsActive })
        .from(jobMatches)
        .orderBy(jobMatches.jobId)
        .all(),
    ).toEqual([
      { jobId: closingJobId, listingIsActive: false },
      { jobId: stayingJobId, listingIsActive: true },
    ]);
  });

  it("brings a stale flag back into step when it re-evaluates a listing", async () => {
    bootstrapJobRadar(database);
    const profileId = seedProfile(database);
    const jobId = seedExcludedMatch(database, profileId, "stale-one");
    writeWithoutTrigger(database, jobId, { listingIsActive: false, jobIsActive: true });
    await evaluateAndStore(loadProfile(database, profileId), {}, database);

    expect(listingActivityFlags(database)).toEqual([true]);
  });

  it("brings flags written before the column existed into step, then reports nothing to do", () => {
    const profileId = seedProfile(database);
    const closedJobId = seedExcludedMatch(database, profileId, "closed-one");
    const openJobId = seedExcludedMatch(database, profileId, "open-one");
    writeWithoutTrigger(database, closedJobId, { listingIsActive: true, jobIsActive: false });
    writeWithoutTrigger(database, openJobId, { listingIsActive: false, jobIsActive: true });

    expect(backfillJobMatchListingActivity(database)).toBe(2);
    expect(backfillJobMatchListingActivity(database)).toBe(0);
    expect(screenedTotal(database, profileId)).toBe(1);
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function screenedTotal(database: ReturnType<typeof createDatabase>, profileId: number): number {
  return getDashboardData({ profileId }, database).screened.total;
}

function listingActivityFlags(database: ReturnType<typeof createDatabase>): readonly boolean[] {
  return database
    .select({ listingIsActive: jobMatches.listingIsActive })
    .from(jobMatches)
    .orderBy(jobMatches.id)
    .all()
    .map((row) => row.listingIsActive);
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

function totalChanges(sqlite: Database.Database): number {
  return (sqlite.prepare("SELECT total_changes() AS changes").get() as { changes: number }).changes;
}

function setListingActivity(
  database: ReturnType<typeof createDatabase>,
  jobId: number,
  isActive: boolean,
): void {
  database.update(jobs).set({ isActive }).where(eq(jobs.id, jobId)).run();
}

// The trigger answers for every write the application makes, which is why the drift the backfill
// repairs has to be produced with the trigger switched off rather than by an ordinary update.
function writeWithoutTrigger(
  database: ReturnType<typeof createDatabase>,
  jobId: number,
  state: { readonly listingIsActive: boolean; readonly jobIsActive: boolean },
): void {
  database.run(sql`DROP TRIGGER job_matches_follow_listing_activation`);
  database.update(jobs).set({ isActive: state.jobIsActive }).where(eq(jobs.id, jobId)).run();
  database
    .update(jobMatches)
    .set({ listingIsActive: state.listingIsActive })
    .where(eq(jobMatches.jobId, jobId))
    .run();
  database.run(sql`
    CREATE TRIGGER job_matches_follow_listing_activation
    AFTER UPDATE OF is_active ON jobs
    FOR EACH ROW WHEN OLD.is_active <> NEW.is_active
    BEGIN
      UPDATE job_matches SET listing_is_active = NEW.is_active WHERE job_id = NEW.id;
    END
  `);
}

function seedProfile(
  database: ReturnType<typeof createDatabase>,
  name = "Listing activity fixture",
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

function seedExcludedMatch(
  database: ReturnType<typeof createDatabase>,
  profileId: number,
  id: string,
): number {
  const jobId = seedListing(database, id);
  seedMatchFor(database, profileId, jobId);
  return jobId;
}

function seedListing(database: ReturnType<typeof createDatabase>, id: string): number {
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
      isActive: true,
      rawPayload: {},
    })
    .returning({ id: jobs.id })
    .get().id;
}

function seedMatchFor(
  database: ReturnType<typeof createDatabase>,
  profileId: number,
  jobId: number,
): void {
  database
    .insert(jobMatches)
    .values({
      profileId,
      jobId,
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "title-mismatch" }],
      ...screeningCountColumns([{ code: "title-mismatch" }]),
      listingIsActive: true,
      updatedAt: recordedAt,
    })
    .run();
}
