import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import type { RawJob } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

const testDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-structured-verification-"));
const previousDatabasePath = process.env.DB_PATH;
process.env.DB_PATH = path.join(testDirectory, "job-radar.sqlite");

const { db } = await import("@/contexts/discovery/infrastructure/sqlite/database");
const { sqlite } = await import("@/platform/sqlite/client");
const { appSettings, discoveryHits, discoveryRuns, jobMatches, jobs, searchProfiles } =
  await import("@/contexts/discovery/infrastructure/sqlite/schema");
const { createSqliteJobDiscoveryCatalog } = await import(
  "@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog"
);
const { createSqliteJobMatchEvaluator } = await import(
  "@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator"
);

const checkedAt = new Date("2026-08-24T09:00:00.000Z");

describe("structured Web3 job verification", () => {
  beforeAll(() => {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(db, new Date("2026-08-24T08:00:00.000Z"));
  });

  beforeEach(() => {
    db.delete(jobMatches).run();
    db.delete(discoveryHits).run();
    db.delete(discoveryRuns).run();
    db.delete(searchProfiles).run();
    db.delete(jobs).run();
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

  it("stores a current structured posting as a verified listing with its apply URL", async () => {
    const { runId } = seedRun(false);
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => ({
        status: "verified",
        job: structuredJob(),
      }),
    });

    const result = await catalog.recordHit(
      hit(runId, "https://web3.career/head-of-engineering-acme/147252"),
    );

    expect(result.jobsWritten).toBe(1);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({
        atsType: "web3-career",
        externalId: "147252",
        applyUrl: "https://apply.example.com/jobs/head-of-engineering",
        title: "Head of Engineering",
        companyName: "Acme",
        evidence: "structured",
        isActive: true,
      }),
    ]);
  });

  it("deactivates an expired posting and retains the verification reason", async () => {
    const { runId } = seedRun(false);
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => ({ status: "closed", reason: "expired" }),
    });

    const result = await catalog.recordHit(
      hit(runId, "https://cryptocurrencyjobs.co/engineering/acme-head-of-engineering/"),
    );

    expect(result.jobsWritten).toBe(1);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({
        atsType: "cryptocurrencyjobs",
        evidence: "search-lead",
        isActive: false,
        rawPayload: {
          verification: {
            status: "closed",
            reason: "expired",
            checkedAt: checkedAt.toISOString(),
          },
        },
      }),
    ]);
  });

  it("matches a protected search lead only for a profile that includes unverified roles", async () => {
    const { runId, profileId: strictProfileId } = seedRun(false);
    const permissiveProfileId = seedProfile(true, "Unverified Web3 leads");
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => ({
        status: "unavailable",
        reason: "protected",
      }),
    });

    const result = await catalog.recordHit(
      hit(runId, "https://cryptojobslist.com/jobs/head-of-engineering-at-acme"),
    );
    const [storedJob] = db.select().from(jobs).all();

    expect(storedJob).toMatchObject({
      evidence: "search-lead",
      isActive: true,
      rawPayload: {
        verification: {
          status: "unavailable",
          reason: "protected",
          checkedAt: checkedAt.toISOString(),
        },
      },
    });
    expect(result.jobsWritten).toBe(1);

    await createSqliteJobMatchEvaluator(db).evaluate(strictProfileId, () => {});
    await createSqliteJobMatchEvaluator(db).evaluate(permissiveProfileId, () => {});

    expect(
      db.select().from(jobMatches).where(eq(jobMatches.profileId, strictProfileId)).get(),
    ).toMatchObject({
      status: "excluded",
      exclusionReasons: expect.arrayContaining([{ code: "unverified-lead" }]),
    });
    expect(
      db.select().from(jobMatches).where(eq(jobMatches.profileId, permissiveProfileId)).get(),
    ).toMatchObject({
      status: "matched",
    });
  });

  it("does not save a partial job when the structured contract is invalid", async () => {
    const { runId } = seedRun(false);
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        throw new Error("Invalid schema.org JobPosting: missing hiringOrganization.name");
      },
    });

    await expect(
      catalog.recordHit(hit(runId, "https://web3.career/head-of-engineering-acme/147252")),
    ).rejects.toThrow("missing hiringOrganization.name");
    expect(db.select().from(jobs).all()).toEqual([]);
  });

  it("does not run structured-page verification for a built-in ATS result", async () => {
    const { runId } = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        lookupCalls += 1;
        throw new Error("structured lookup should not run");
      },
    });

    const result = await catalog.recordHit(
      hit(runId, "https://boards.greenhouse.io/example/jobs/12345"),
    );

    expect(lookupCalls).toBe(0);
    expect(result.jobsWritten).toBe(1);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({ atsType: "greenhouse", evidence: "search-lead" }),
    ]);
  });

  it("verifies the same structured page only once per catalog run", async () => {
    const { runId } = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        lookupCalls += 1;
        return { status: "unavailable", reason: "protected" } as const;
      },
    });
    const url = "https://web3.career/head-of-engineering-acme/147252";

    const first = await catalog.recordHit(hit(runId, url));
    const second = await catalog.recordHit(hit(runId, url));

    expect(lookupCalls).toBe(1);
    expect(first).toMatchObject({ inserted: true, jobsWritten: 1 });
    expect(second).toMatchObject({ inserted: false, jobsWritten: 1 });
    expect(db.select().from(jobs).all()).toHaveLength(1);
  });

  it("does not verify a custom source removed from structured verification settings", async () => {
    const { runId } = seedRun(false);
    const discoverySetting = db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get();
    if (!discoverySetting || !isRecord(discoverySetting.value)) {
      throw new Error("Missing discovery setting fixture");
    }
    db.update(appSettings)
      .set({
        value: {
          ...discoverySetting.value,
          structuredVerificationSources: ["cryptocurrencyjobs", "cryptojobslist"],
        },
      })
      .where(eq(appSettings.key, "discovery"))
      .run();
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        lookupCalls += 1;
        throw new Error("structured lookup should not run");
      },
    });

    try {
      const result = await catalog.recordHit(
        hit(runId, "https://web3.career/head-of-engineering-acme/147252"),
      );

      expect(lookupCalls).toBe(0);
      expect(result.jobsWritten).toBe(1);
    } finally {
      db.update(appSettings)
        .set({ value: discoverySetting.value })
        .where(eq(appSettings.key, "discovery"))
        .run();
    }
  });

  it("does not verify a custom source page without a job identifier", async () => {
    const { runId } = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        lookupCalls += 1;
        throw new Error("structured lookup should not run");
      },
    });

    const result = await catalog.recordHit(hit(runId, "https://web3.career/"));

    expect(lookupCalls).toBe(0);
    expect(result.jobsWritten).toBe(1);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({ atsType: "web3-career", externalId: "" }),
    ]);
  });
});

function seedRun(includeUnverified: boolean): { runId: number; profileId: number } {
  const profileId = seedProfile(includeUnverified, "Web3 source verification");
  const runId = db
    .insert(discoveryRuns)
    .values({
      profileId,
      provider: "fixture-search",
      status: "running",
      startedAt: checkedAt,
    })
    .returning({ id: discoveryRuns.id })
    .get().id;
  return { runId, profileId };
}

function seedProfile(includeUnverified: boolean, name: string): number {
  const value = db
    .insert(searchProfiles)
    .values({
      name,
      titleTerms: ["Head of Engineering"],
      locationTerms: ["Remote"],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: true,
      includeUnverified,
      salaryCurrency: "",
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 30,
      minScore: 60,
      enabled: true,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  const profileId = searchProfileIdFrom(value);
  if (profileId === null) {
    throw new Error(`Invalid profile fixture identifier: ${value}`);
  }
  return profileId;
}

function hit(runId: number, url: string) {
  return {
    runId,
    query: 'site:example.com intitle:"Head of Engineering"',
    rank: 1,
    result: {
      title: "Head of Engineering at Acme",
      url,
      snippet: "Head of Engineering. Remote. Work from anywhere.",
    },
    locationTerms: ["Remote"],
    recordedAt: checkedAt,
  };
}

function structuredJob(): RawJob {
  return {
    atsType: "web3-career",
    externalId: "147252",
    canonicalUrl: "https://web3.career/head-of-engineering-acme/147252",
    applyUrl: "https://apply.example.com/jobs/head-of-engineering",
    title: "Head of Engineering",
    companyName: "Acme",
    locations: ["Worldwide"],
    description: "Lead the software engineering function. Work from anywhere.",
    department: "Engineering",
    employmentType: "FULL_TIME",
    workplaceType: "remote",
    publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    publishedSalary: null,
    evidence: "structured",
    rawPayload: {
      verifiedAt: checkedAt.toISOString(),
      verifiedSource: "schema.org/JobPosting",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
