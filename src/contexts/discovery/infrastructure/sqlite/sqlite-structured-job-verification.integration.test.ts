import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import type { RawJob } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { makeDedupeKey } from "@/contexts/discovery/infrastructure/job-sources/urls";

const testDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-structured-verification-"));
const previousDatabasePath = process.env.DB_PATH;
process.env.DB_PATH = path.join(testDirectory, "job-radar.sqlite");

const { db } = await import("@/contexts/discovery/infrastructure/sqlite/database");
const { sqlite } = await import("@/platform/sqlite/client");
const {
  appSettings,
  companyBoards,
  discoveryHits,
  discoveryRuns,
  jobMatches,
  jobs,
  searchProfiles,
} = await import("@/contexts/discovery/infrastructure/sqlite/schema");
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
    db.delete(companyBoards).run();
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

    await createSqliteJobMatchEvaluator(db).evaluate(
      strictProfileId,
      resolvedMarkets(["Remote"]),
      () => {},
    );
    await createSqliteJobMatchEvaluator(db).evaluate(
      permissiveProfileId,
      resolvedMarkets(["Remote"]),
      () => {},
    );

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
    let structuredLookupCalls = 0;
    let exactLookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupStructuredJobPage: async () => {
        structuredLookupCalls += 1;
        throw new Error("structured lookup should not run");
      },
      lookupAtsPosting: async () => {
        exactLookupCalls += 1;
        return {
          status: "transient_failure",
          reason: "http-503",
          checkedUrl: "https://boards-api.greenhouse.io/v1/boards/example/jobs/12345",
        } as const;
      },
    });

    const result = await catalog.recordHit(
      hit(runId, "https://boards.greenhouse.io/example/jobs/12345"),
    );

    expect(structuredLookupCalls).toBe(0);
    expect(exactLookupCalls).toBe(1);
    expect(result.jobsWritten).toBe(1);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({ atsType: "greenhouse", evidence: "search-lead" }),
    ]);
  });

  it("verifies an off-domain Greenhouse hit in the same run without duplicating its board job", async () => {
    const { runId, profileId } = seedCoupangRun();
    const boardId = seedCoupangBoardJob();
    const lookupCalls: Array<{ boardId: number; externalId: string }> = [];
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async (board, externalId) => {
        lookupCalls.push({ boardId: board.id, externalId });
        return { status: "verified", job: coupangJob() } as const;
      },
    });

    const result = await catalog.recordHit(coupangHit(runId));
    await createSqliteJobMatchEvaluator(db).evaluate(
      profileId,
      resolvedMarkets(["Seoul"]),
      () => {},
    );

    expect(lookupCalls).toEqual([{ boardId, externalId: "8124387" }]);
    expect(result).toMatchObject({ jobsWritten: 1 });
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({
        boardId,
        atsType: "greenhouse",
        externalId: "8124387",
        title: "Director, Back-end Engineering (Rocket Pay)",
        locationText: "Seoul, South Korea",
        evidence: "structured",
        isActive: true,
      }),
    ]);
    expect(db.select().from(discoveryHits).get()).toMatchObject({
      atsType: "greenhouse",
      boardId,
      verificationStatus: "verified",
      verificationReason: "",
      verificationUrl: "https://careers.coupang.com/jobs/?gh_jid=8124387",
      verificationCheckedAt: checkedAt,
    });
    expect(
      db.select().from(jobMatches).where(eq(jobMatches.profileId, profileId)).get(),
    ).toMatchObject({ status: "matched" });
  });

  it.each([
    ["not_found", "http-404", false],
    ["protected", "http-403", true],
    ["transient_failure", "http-503", true],
  ] as const)(
    "persists an exact Greenhouse %s outcome against its discovery hit",
    async (status, reason, isActive) => {
      const { runId } = seedRun(false);
      const catalog = createSqliteJobDiscoveryCatalog(db, {
        lookupAtsPosting: async () => ({
          status,
          reason,
          checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
        }),
      });

      await catalog.recordHit(hit(runId, "https://boards.greenhouse.io/acme/jobs/12345"));

      expect(db.select().from(discoveryHits).get()).toMatchObject({
        verificationStatus: status,
        verificationReason: reason,
        verificationUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
        verificationCheckedAt: checkedAt,
      });
      expect(db.select().from(jobs).get()).toMatchObject({
        evidence: "search-lead",
        isActive,
        rawPayload: {
          verification: {
            status,
            reason,
            checkedAt: checkedAt.toISOString(),
          },
        },
      });
    },
  );

  it("keeps a lead-only missing posting classified as not found on a later run", async () => {
    const firstRun = seedRun(false);
    const firstCatalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => ({
        status: "not_found",
        reason: "http-404",
        checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
      }),
    });
    await firstCatalog.recordHit(
      hit(firstRun.runId, "https://boards.greenhouse.io/acme/jobs/12345"),
    );

    const secondRunId = db
      .insert(discoveryRuns)
      .values({
        profileId: firstRun.profileId,
        provider: "fixture-search",
        status: "running",
        startedAt: checkedAt,
      })
      .returning({ id: discoveryRuns.id })
      .get().id;
    const secondCatalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => ({
        status: "not_found",
        reason: "http-404",
        checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
      }),
    });
    await secondCatalog.recordHit(hit(secondRunId, "https://boards.greenhouse.io/acme/jobs/12345"));

    expect(
      db
        .select({ status: discoveryHits.verificationStatus })
        .from(discoveryHits)
        .all()
        .map((row) => row.status),
    ).toEqual(["not_found", "not_found"]);
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({ evidence: "search-lead", isActive: false }),
    ]);
  });

  it("looks up the same exact posting only once per catalog run", async () => {
    const { runId } = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => {
        lookupCalls += 1;
        return {
          status: "not_found",
          reason: "http-404",
          checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
        } as const;
      },
    });
    const searchHit = hit(runId, "https://boards.greenhouse.io/acme/jobs/12345");

    await catalog.recordHit(searchHit);
    await catalog.recordHit({
      ...searchHit,
      query: "site:boards.greenhouse.io engineering",
      result: { ...searchHit.result, url: `${searchHit.result.url}?utm_source=search` },
    });

    expect(lookupCalls).toBe(1);
    expect(db.select().from(discoveryHits).all()).toEqual([
      expect.objectContaining({
        verificationStatus: "not_found",
        verificationReason: "http-404",
      }),
      expect.objectContaining({
        verificationStatus: "not_found",
        verificationReason: "http-404",
      }),
    ]);
  });

  it("refreshes an exact posting outcome in a later run on the same catalog", async () => {
    const firstRun = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => {
        lookupCalls += 1;
        return lookupCalls === 1
          ? {
              status: "not_found",
              reason: "http-404",
              checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
            }
          : {
              status: "protected",
              reason: "http-429",
              checkedUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
            };
      },
    });
    await catalog.recordHit(hit(firstRun.runId, "https://boards.greenhouse.io/acme/jobs/12345"));
    const secondCheckedAt = new Date("2026-08-24T10:00:00.000Z");
    const secondRunId = db
      .insert(discoveryRuns)
      .values({
        profileId: firstRun.profileId,
        provider: "fixture-search",
        status: "running",
        startedAt: secondCheckedAt,
      })
      .returning({ id: discoveryRuns.id })
      .get().id;

    await catalog.recordHit({
      ...hit(secondRunId, "https://boards.greenhouse.io/acme/jobs/12345"),
      recordedAt: secondCheckedAt,
    });

    expect(lookupCalls).toBe(2);
    expect(
      db
        .select({
          status: discoveryHits.verificationStatus,
          checkedAt: discoveryHits.verificationCheckedAt,
        })
        .from(discoveryHits)
        .all(),
    ).toEqual([
      { status: "not_found", checkedAt },
      { status: "protected", checkedAt: secondCheckedAt },
    ]);
  });

  it("records a previously known Greenhouse posting as closed when exact lookup no longer finds it", async () => {
    const { runId } = seedRun(false);
    const boardId = seedCoupangBoardJob(true);
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => ({
        status: "not_found",
        reason: "http-404",
        checkedUrl: "https://boards-api.greenhouse.io/v1/boards/coupang/jobs/8124387",
      }),
    });

    await catalog.recordHit(coupangHit(runId));

    expect(db.select().from(discoveryHits).get()).toMatchObject({
      boardId,
      verificationStatus: "closed",
      verificationReason: "http-404",
    });
    expect(db.select().from(jobs).all()).toEqual([
      expect.objectContaining({
        boardId,
        externalId: "8124387",
        evidence: "structured",
        isActive: false,
        rawPayload: {
          verification: {
            status: "closed",
            reason: "http-404",
            checkedAt: checkedAt.toISOString(),
          },
        },
      }),
    ]);
  });

  it("records an unresolved off-domain Greenhouse identity as a transient outcome", async () => {
    const { runId } = seedRun(false);
    let lookupCalls = 0;
    const catalog = createSqliteJobDiscoveryCatalog(db, {
      lookupAtsPosting: async () => {
        lookupCalls += 1;
        return { status: "verified", job: coupangJob() } as const;
      },
    });

    await catalog.recordHit(coupangHit(runId));

    expect(lookupCalls).toBe(0);
    expect(db.select().from(discoveryHits).get()).toMatchObject({
      atsType: "greenhouse",
      boardId: null,
      verificationStatus: "transient_failure",
      verificationReason: "board-unresolved",
      verificationUrl: "https://careers.coupang.com/jobs?gh_jid=8124387",
      verificationCheckedAt: checkedAt,
    });
    expect(db.select().from(jobs).get()).toMatchObject({
      evidence: "search-lead",
      isActive: true,
      rawPayload: {
        verification: {
          status: "transient_failure",
          reason: "board-unresolved",
          checkedAt: checkedAt.toISOString(),
        },
      },
    });
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

function seedCoupangRun(): { runId: number; profileId: number } {
  const value = db
    .insert(searchProfiles)
    .values({
      name: "Asia engineering leadership",
      titleTerms: ["Director"],
      locationTerms: ["Seoul"],
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

function seedCoupangBoardJob(isActive = false): number {
  const boardId = db
    .insert(companyBoards)
    .values({
      atsType: "greenhouse",
      canonicalKey: "greenhouse:coupang",
      companyName: "Coupang",
      slug: "coupang",
      baseUrl: "https://boards.greenhouse.io/coupang",
      config: {},
      enabled: true,
      discoveredAt: checkedAt,
    })
    .returning({ id: companyBoards.id })
    .get().id;
  const canonicalUrl = "https://boards.greenhouse.io/coupang/jobs/8124387";
  db.insert(jobs)
    .values({
      boardId,
      atsType: "greenhouse",
      externalId: "8124387",
      dedupeKey: makeDedupeKey("greenhouse", canonicalUrl, "8124387", "greenhouse:coupang"),
      canonicalUrl,
      companyName: "Coupang",
      title: "Stale imported title",
      locationText: "Seoul, South Korea",
      locations: ["Seoul, South Korea"],
      evidence: "structured",
      firstSeenAt: checkedAt,
      lastSeenAt: checkedAt,
      isActive,
      rawPayload: {},
    })
    .run();
  return boardId;
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
    marketScopes: literalMarketScopes(["Remote"]),
    recordedAt: checkedAt,
  };
}

function coupangHit(runId: number) {
  return {
    runId,
    query: 'site:careers.coupang.com intitle:"Director Engineering" Seoul',
    rank: 1,
    result: {
      title: "Director, Back-end Engineering (Rocket Pay) | Coupang Careers",
      url: "https://careers.coupang.com/jobs/?gh_jid=8124387",
      snippet: "Director, Back-end Engineering for Rocket Pay in Seoul, South Korea.",
    },
    marketScopes: literalMarketScopes(["Seoul"]),
    recordedAt: checkedAt,
  };
}

function literalMarketScopes(terms: readonly string[]) {
  return terms.map((term) => ({
    key: `literal:${term.toLocaleLowerCase()}`,
    label: term,
    terms: [term],
  }));
}

function resolvedMarkets(terms: readonly string[]) {
  return {
    marketScopes: literalMarketScopes(terms),
    excludedMarketScopes: [],
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

function coupangJob(): RawJob {
  return {
    atsType: "greenhouse",
    externalId: "8124387",
    canonicalUrl: "https://careers.coupang.com/jobs/?gh_jid=8124387",
    applyUrl: "https://careers.coupang.com/jobs/?gh_jid=8124387#app",
    title: "Director, Back-end Engineering (Rocket Pay)",
    companyName: "Coupang",
    locations: ["Seoul, South Korea"],
    description: "Lead Rocket Pay back-end engineering in Seoul.",
    department: "Engineering",
    employmentType: "FULL_TIME",
    workplaceType: "onsite",
    publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    publishedSalary: null,
    evidence: "structured",
    rawPayload: { id: 8124387 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
