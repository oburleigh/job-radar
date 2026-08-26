import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import type { SearchProvider } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { SearchProviderFailure } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { createSaveSearchProfile } from "@/contexts/discovery/application/search-profiles/save/use-case";
import { type SearchProfileId, searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import { createSearchProfileDefinition } from "@/contexts/discovery/domain/search-profile";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { createSqliteSearchProfileRepository } from "@/contexts/discovery/infrastructure/sqlite/search-profile-repository";

const testDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-runner-concurrency-"));
const previousDatabasePath = process.env.DB_PATH;
process.env.DB_PATH = path.join(testDirectory, "job-radar.sqlite");

const { db } = await import("@/contexts/discovery/infrastructure/sqlite/database");
const { sqlite } = await import("@/platform/sqlite/client");
const { discoveryQueries, discoveryRuns, searchProfiles, sourceDomains } = await import(
  "@/contexts/discovery/infrastructure/sqlite/schema"
);
const { createSqliteDiscoverySetup } = await import(
  "@/contexts/discovery/infrastructure/configuration/sqlite-discovery-setup"
);
const { createSqliteDiscoveryRunJournal } = await import(
  "@/contexts/discovery/infrastructure/sqlite/discovery-run-journal"
);
const { createSqliteJobDiscoveryCatalog } = await import(
  "@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog"
);
const { createSqliteJobMatchEvaluator } = await import(
  "@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator"
);

describe("discovery concurrency", () => {
  beforeAll(() => {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(db, new Date("2026-08-20T09:00:00.000Z"));
  });

  afterAll(() => {
    sqlite.close();
    if (previousDatabasePath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDatabasePath;
    }
    rmSync(testDirectory, { recursive: true, force: true });
  });

  it("lets a profile save complete while a large result batch is being processed", async () => {
    const profileId = seedProfile();
    seedSingleSource();
    const resultCount = 50;
    const searchStarted = Promise.withResolvers<void>();
    const releaseSearch = Promise.withResolvers<void>();
    let searchCalls = 0;
    const provider: SearchProvider = {
      name: "test-provider",
      prepare: (query) => ({
        query,
        async execute() {
          searchCalls += 1;
          if (searchCalls > 1) {
            return [];
          }
          searchStarted.resolve();
          await releaseSearch.promise;
          return Array.from({ length: resultCount }, (_, index) => ({
            title: `Engineering leader ${index}`,
            url: `https://example.com/jobs/${index}`,
            snippet: "Engineering leadership role",
          }));
        },
      }),
    };
    let discoveryFinished = false;
    const discovery = createDiscovery(provider)
      .discoverJobs({
        profileId,
        providerName: provider.name,
        source: "ashby",
        syncBoards: false,
      })
      .finally(() => {
        discoveryFinished = true;
      });
    await searchStarted.promise;

    const saveProfile = createSaveSearchProfile({
      profiles: createSqliteSearchProfileRepository(db),
      now: () => new Date("2026-08-20T10:00:00.000Z"),
    });
    const saveCompleted = new Promise<{
      readonly discoveryFinished: boolean;
      readonly result: ReturnType<typeof saveProfile>;
    }>((resolve) => {
      setImmediate(async () => {
        const result = saveProfile({
          id: profileId,
          profile: profileDefinition({
            name: "Concurrent profile",
            targetTitles: ["VP Engineering"],
            targetLocations: ["Dubai"],
            requiredJobTerms: [],
            excludedTitleTerms: [],
            excludedLocationTerms: [],
            excludedDescriptionTerms: [],
            includeRemote: false,
            includeUnverified: false,
            salaryPreference: { currency: null, minimumAnnual: null, maximumAnnual: null },
            maximumAgeDays: 30,
            minimumScore: 82,
          }),
        });
        resolve({
          discoveryFinished,
          result,
        });
      });
    });

    releaseSearch.resolve();
    const saved = await saveCompleted;
    await discovery;

    expect(saved.result).toEqual({ status: "saved", id: profileId, created: false });
    expect(saved.discoveryFinished).toBe(false);
    expect(
      db
        .select({ minScore: searchProfiles.minScore })
        .from(searchProfiles)
        .where(eq(searchProfiles.id, profileId))
        .get(),
    ).toEqual({ minScore: 82 });
  }, 10_000);

  it("records the lifecycle and summary of every planned query", async () => {
    const profileId = seedProfile("Lifecycle profile");
    seedSingleSource();
    const provider: SearchProvider = {
      name: "test-provider",
      prepare: (query) => ({
        query,
        execute: async () => [
          {
            title: "Engineering leader",
            url: "https://example.com/jobs/engineering-leader",
            snippet: "Engineering leadership role in Dubai",
          },
        ],
      }),
    };

    const summary = await createDiscovery(provider).discoverJobs({
      profileId,
      providerName: provider.name,
      source: "ashby",
      syncBoards: false,
    });

    expect(summary).toEqual({
      runId: expect.any(Number),
      queries: 2,
      hits: 1,
      boards: 0,
      jobs: 0,
      matches: 0,
      queryErrors: 0,
      syncErrors: 0,
    });
    expect(
      db.select().from(discoveryRuns).where(eq(discoveryRuns.id, summary.runId)).get(),
    ).toMatchObject({
      profileId,
      provider: "test-provider",
      status: "completed",
      queryCount: 2,
      hitCount: 1,
      queryErrorCount: 0,
    });
    expect(
      db.select().from(discoveryQueries).where(eq(discoveryQueries.runId, summary.runId)).all(),
    ).toEqual([
      expect.objectContaining({ status: "completed", hitCount: 1 }),
      expect.objectContaining({ status: "completed", hitCount: 1 }),
    ]);
  });

  it("records only the admitted request after a fatal provider failure", async () => {
    const profileId = seedProfile("Fatal provider profile");
    seedSingleSource();
    const provider: SearchProvider = {
      name: "test-provider",
      prepare: (query) => ({
        query,
        execute: async () => {
          throw new SearchProviderFailure({
            provider: "test-provider",
            classification: "fatal",
            code: "credit-exhausted",
            attempts: 1,
            message: "Test provider has no credits",
          });
        },
      }),
    };

    const summary = await createDiscovery(provider).discoverJobs({
      profileId,
      providerName: provider.name,
      source: "ashby",
      syncBoards: false,
    });

    expect(
      db.select().from(discoveryRuns).where(eq(discoveryRuns.id, summary.runId)).get(),
    ).toMatchObject({
      status: "failed",
      queryCount: 1,
      queryErrorCount: 1,
    });
    expect(
      db
        .select({ status: discoveryQueries.status, error: discoveryQueries.error })
        .from(discoveryQueries)
        .where(eq(discoveryQueries.runId, summary.runId))
        .orderBy(discoveryQueries.id)
        .all(),
    ).toEqual([{ status: "failed", error: "Test provider has no credits" }]);
  });
});

function createDiscovery(provider: SearchProvider) {
  return createJobDiscovery({
    setup: createSqliteDiscoverySetup(db),
    runs: createSqliteDiscoveryRunJournal(db),
    jobs: createSqliteJobDiscoveryCatalog(db),
    matches: createSqliteJobMatchEvaluator(db),
    providers: { get: () => provider },
    now: () => new Date(),
    yieldControl: () => new Promise((resolve) => setImmediate(resolve)),
  });
}

function seedProfile(name = "Concurrent profile"): SearchProfileId {
  const value = db
    .insert(searchProfiles)
    .values({
      name,
      titleTerms: ["VP Engineering"],
      locationTerms: ["Dubai"],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: false,
      includeUnverified: true,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 30,
      minScore: 70,
      enabled: true,
      createdAt: new Date("2026-08-20T09:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  const id = searchProfileIdFrom(value);
  if (id === null) {
    throw new Error(`Invalid search profile fixture identifier: ${value}`);
  }
  return id;
}

function seedSingleSource(): void {
  db.update(sourceDomains).set({ enabled: false }).run();
  db.insert(sourceDomains)
    .values({
      atsType: "ashby",
      pattern: "jobs.ashbyhq.com",
      enabled: true,
      supportsBoardSync: false,
      priority: 1,
    })
    .onConflictDoUpdate({
      target: sourceDomains.pattern,
      set: { enabled: true, supportsBoardSync: false, priority: 1 },
    })
    .run();
}

function profileDefinition(draft: Parameters<typeof createSearchProfileDefinition>[0]) {
  const result = createSearchProfileDefinition(draft);
  if (result.status === "invalid") {
    throw new Error(`Invalid profile fixture: ${result.reason}`);
  }
  return result.profile;
}
