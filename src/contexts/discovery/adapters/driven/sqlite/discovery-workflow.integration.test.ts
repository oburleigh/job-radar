import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSqliteSearchProfileRepository } from "@/contexts/discovery/adapters/driven/sqlite/search-profile-repository";
import { createSaveProfileAction } from "@/contexts/discovery/adapters/driving/web/save-profile-action";
import { createJobDiscovery } from "@/contexts/discovery/hexagon/application/discover-jobs";
import { createSaveSearchProfile } from "@/contexts/discovery/hexagon/application/save-search-profile";
import type { SearchProvider } from "@/contexts/discovery/hexagon/application/search-provider";

const testDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-runner-concurrency-"));
const previousDatabasePath = process.env.DB_PATH;
process.env.DB_PATH = path.join(testDirectory, "job-radar.sqlite");

const { db } = await import("@/contexts/discovery/adapters/driven/sqlite/database");
const { sqlite } = await import("@/platform/sqlite/client");
const { discoveryQueries, discoveryRuns, searchProfiles, sourceDomains } = await import(
  "@/contexts/discovery/adapters/driven/sqlite/schema"
);
const { createSqliteDiscoverySetup } = await import(
  "@/contexts/discovery/adapters/driven/configuration/sqlite-discovery-setup"
);
const { createSqliteDiscoveryRunJournal } = await import(
  "@/contexts/discovery/adapters/driven/sqlite/discovery-run-journal"
);
const { createSqliteJobDiscoveryCatalog } = await import(
  "@/contexts/discovery/adapters/driven/sqlite/sqlite-job-discovery-catalog"
);

describe("discovery concurrency", () => {
  beforeAll(() => {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
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
      async search() {
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

    const saveProfile = createSaveProfileAction({
      assertLocalRequest: async () => undefined,
      saveSearchProfile: createSaveSearchProfile({
        profiles: createSqliteSearchProfileRepository(db),
        now: () => new Date("2026-08-20T10:00:00.000Z"),
      }),
      revalidatePath: () => undefined,
      redirect: () => undefined,
    });
    const saveCompleted = new Promise<{
      readonly discoveryFinished: boolean;
      readonly result: Awaited<ReturnType<typeof saveProfile>>;
    }>((resolve) => {
      setImmediate(async () => {
        const result = await saveProfile(
          { ok: false, message: "" },
          profileForm(profileId, { minScore: "82" }),
        );
        resolve({
          discoveryFinished,
          result,
        });
      });
    });

    releaseSearch.resolve();
    const saved = await saveCompleted;
    await discovery;

    expect(saved.result).toEqual({ ok: true, message: "Profile saved." });
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
      search: async (_query, _request) => [
        {
          title: "Engineering leader",
          url: "https://example.com/jobs/engineering-leader",
          snippet: "Engineering leadership role in Dubai",
        },
      ],
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
});

function createDiscovery(provider: SearchProvider) {
  return createJobDiscovery({
    setup: createSqliteDiscoverySetup(db),
    runs: createSqliteDiscoveryRunJournal(db),
    jobs: createSqliteJobDiscoveryCatalog(db),
    providers: { get: () => provider },
    now: () => new Date(),
    yieldControl: () => new Promise((resolve) => setImmediate(resolve)),
  });
}

function seedProfile(name = "Concurrent profile"): number {
  return db
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

function profileForm(profileId: number, overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    id: String(profileId),
    name: "Concurrent profile",
    titleTerms: "VP Engineering",
    locationTerms: "Dubai",
    requiredJobTerms: "",
    excludedTitleTerms: "",
    excludedLocationTerms: "",
    excludedDescriptionTerms: "",
    salaryCurrency: "",
    salaryMin: "",
    salaryMax: "",
    maxAgeDays: "30",
    minScore: "70",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
