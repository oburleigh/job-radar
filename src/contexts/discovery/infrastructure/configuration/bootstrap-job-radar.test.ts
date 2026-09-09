import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  appSettings,
  atsIntegrations,
  companyBoards,
  discoveryRuns,
  jobs,
  searchProfiles,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { initializeTestSchema } from "~/tests/support/current-schema";
import { bootstrapJobRadar, defaultProviderExecutionSettings } from "./bootstrap-job-radar";

describe("Job Radar database bootstrap", () => {
  let directory: string;
  let sqlite: Database.Database;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-bootstrap-"));
    sqlite = new Database(path.join(directory, "job-radar.sqlite"));
    database = createDatabase(sqlite);
    initializeTestSchema(database);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps schema migration separate from product defaults", () => {
    expect(database.select().from(appSettings).all()).toEqual([]);
    expect(database.select().from(atsIntegrations).all()).toEqual([]);
    expect(database.select().from(sourceDomains).all()).toEqual([]);

    bootstrapJobRadar(database, new Date("2026-08-20T00:00:00.000Z"));

    expect(database.select().from(appSettings).all()).toHaveLength(8);
    expect(database.select().from(atsIntegrations).all()).toHaveLength(13);
    expect(database.select().from(sourceDomains).all()).toHaveLength(15);
    expect(database.select().from(searchProfiles).all()).toEqual([]);
    expect(database.select().from(companyBoards).all()).toEqual([]);
    expect(database.select().from(jobs).all()).toEqual([]);
    expect(database.select().from(discoveryRuns).all()).toEqual([]);
    expect(
      database
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "marketVocabulary"))
        .get()?.value,
    ).toEqual({
      markets: [
        {
          key: "country:AE",
          aliases: ["UAE"],
          covers: ["subdivision:AE-AZ", "subdivision:AE-DU"],
          searchLanguage: "en",
        },
        { key: "subdivision:AE-AZ", label: "Abu Dhabi", aliases: [] },
        { key: "subdivision:AE-DU", label: "Dubai", aliases: [] },
      ],
    });
  });

  it("does not overwrite settings or sources changed by the user", () => {
    const firstBootstrapAt = new Date("2026-08-20T00:00:00.000Z");
    bootstrapJobRadar(database, firstBootstrapAt);
    database
      .update(appSettings)
      .set({ value: { timeoutMs: 45000, userAgent: "My local client" } })
      .where(eq(appSettings.key, "network"))
      .run();
    database
      .update(sourceDomains)
      .set({ enabled: false })
      .where(eq(sourceDomains.pattern, "jobs.ashbyhq.com"))
      .run();

    bootstrapJobRadar(database, new Date("2026-08-21T00:00:00.000Z"));

    expect(
      database.select().from(appSettings).where(eq(appSettings.key, "network")).get()?.value,
    ).toEqual({ timeoutMs: 45000, userAgent: "My local client" });
    expect(
      database
        .select()
        .from(sourceDomains)
        .where(eq(sourceDomains.pattern, "jobs.ashbyhq.com"))
        .get()?.enabled,
    ).toBe(false);
  });

  it("updates the legacy notification duration once and preserves a user-configured duration", () => {
    const legacyUi = {
      discoveryNotificationDurationMs: 2_000,
      discoveryPollIntervalMs: 3_000,
      discoveryStaleAfterMs: 300_000,
    };
    bootstrapJobRadar(database, new Date("2026-08-20T00:00:00.000Z"));
    database.update(appSettings).set({ value: legacyUi }).where(eq(appSettings.key, "ui")).run();

    bootstrapJobRadar(database, new Date("2026-08-21T00:00:00.000Z"));

    expect(
      database.select().from(appSettings).where(eq(appSettings.key, "ui")).get()?.value,
    ).toEqual({ ...legacyUi, discoveryNotificationDurationMs: 3_000 });

    database
      .update(appSettings)
      .set({ value: { ...legacyUi, discoveryNotificationDurationMs: 5_000 } })
      .where(eq(appSettings.key, "ui"))
      .run();
    bootstrapJobRadar(database, new Date("2026-08-22T00:00:00.000Z"));

    expect(
      database.select().from(appSettings).where(eq(appSettings.key, "ui")).get()?.value,
    ).toEqual({ ...legacyUi, discoveryNotificationDurationMs: 5_000 });
  });

  it("migrates the superseded disabled company-board policy into board choices once", () => {
    bootstrapJobRadar(database, new Date("2026-08-20T00:00:00.000Z"));
    database
      .insert(companyBoards)
      .values(
        ["acme", "example"].map((slug) => ({
          atsType: "ashby" as const,
          canonicalKey: `ashby:${slug}`,
          companyName: slug,
          slug,
          baseUrl: `https://jobs.ashbyhq.com/${slug}`,
          config: {},
          enabled: true,
          discoveredAt: new Date("2026-08-20T00:00:00.000Z"),
        })),
      )
      .run();
    const discovery = database
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get()?.value;
    if (typeof discovery !== "object" || discovery === null || Array.isArray(discovery)) {
      throw new Error("The discovery bootstrap fixture must be an object.");
    }
    database
      .update(appSettings)
      .set({ value: { ...discovery, companyBoardRefreshEnabled: false } })
      .where(eq(appSettings.key, "discovery"))
      .run();

    bootstrapJobRadar(database, new Date("2026-08-21T00:00:00.000Z"));

    expect(
      database
        .select()
        .from(companyBoards)
        .all()
        .map((board) => board.enabled),
    ).toEqual([false, false]);
    expect(
      database
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "discovery"))
        .get()?.value,
    ).not.toHaveProperty("companyBoardRefreshEnabled");

    database
      .update(companyBoards)
      .set({ enabled: true })
      .where(eq(companyBoards.canonicalKey, "ashby:acme"))
      .run();
    bootstrapJobRadar(database, new Date("2026-08-22T00:00:00.000Z"));

    expect(
      database
        .select({ enabled: companyBoards.enabled })
        .from(companyBoards)
        .where(eq(companyBoards.canonicalKey, "ashby:acme"))
        .get()?.enabled,
    ).toBe(true);
  });

  it("backfills provider execution policy without overwriting discovery settings", () => {
    bootstrapJobRadar(database, new Date("2026-08-20T00:00:00.000Z"));
    const discovery = database
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get()?.value;
    if (typeof discovery !== "object" || discovery === null || Array.isArray(discovery)) {
      throw new Error("The discovery bootstrap fixture must be an object.");
    }
    const legacyDiscovery = Object.fromEntries(
      Object.entries(discovery).filter(
        ([key]) =>
          ![
            "providerExecution",
            "minimumUsefulHitsPerPage",
            "maxPagesPerLane",
            "maxRequestsPerRun",
          ].includes(key),
      ),
    );
    database
      .update(appSettings)
      .set({ value: { ...legacyDiscovery, resultsPerQuery: 37 } })
      .where(eq(appSettings.key, "discovery"))
      .run();

    const backfilledAt = new Date("2026-08-21T00:00:00.000Z");
    bootstrapJobRadar(database, backfilledAt);

    const backfilled = database
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get();
    expect(backfilled?.value).toMatchObject({
      resultsPerQuery: 37,
      providerExecution: defaultProviderExecutionSettings,
      minimumUsefulHitsPerPage: 1,
      maxPagesPerLane: 3,
      maxRequestsPerRun: 111,
    });
    expect(backfilled?.updatedAt).toEqual(backfilledAt);
  });

  it("preserves a user-configured provider execution policy", () => {
    const configuredAt = new Date("2026-08-20T00:00:00.000Z");
    bootstrapJobRadar(database, configuredAt);
    const row = database
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get();
    if (typeof row?.value !== "object" || row.value === null || Array.isArray(row.value)) {
      throw new Error("The discovery bootstrap fixture must be an object.");
    }
    const providerExecution = {
      concurrency: 4,
      requestsPerInterval: 9,
      intervalMs: 2_000,
      maxAttempts: 2,
      retryMinDelayMs: 250,
      retryMaxDelayMs: 3_000,
      retryMaxTimeMs: 45_000,
    };
    database
      .update(appSettings)
      .set({ value: { ...row.value, providerExecution }, updatedAt: configuredAt })
      .where(eq(appSettings.key, "discovery"))
      .run();

    bootstrapJobRadar(database, new Date("2026-08-21T00:00:00.000Z"));

    const preserved = database
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get();
    expect(preserved?.value).toMatchObject({ providerExecution });
    expect(preserved?.updatedAt).toEqual(configuredAt);
  });

  it("backfills new exact-posting endpoints without overwriting configured ATS endpoints", () => {
    const configuredAt = new Date("2026-08-20T00:00:00.000Z");
    bootstrapJobRadar(database, configuredAt);
    database
      .update(atsIntegrations)
      .set({
        endpoints: {
          jobs: "https://greenhouse.example.test/custom/{slug}",
        },
        updatedAt: configuredAt,
      })
      .where(eq(atsIntegrations.atsType, "greenhouse"))
      .run();
    database
      .update(atsIntegrations)
      .set({
        endpoints: {
          jobs: "https://lever.example.test/custom/{slug}",
          jobsEu: "https://lever.example.test/custom-eu/{slug}",
        },
        updatedAt: configuredAt,
      })
      .where(eq(atsIntegrations.atsType, "lever"))
      .run();

    const backfilledAt = new Date("2026-08-21T00:00:00.000Z");
    bootstrapJobRadar(database, backfilledAt);

    expect(
      database
        .select({ endpoints: atsIntegrations.endpoints, updatedAt: atsIntegrations.updatedAt })
        .from(atsIntegrations)
        .where(eq(atsIntegrations.atsType, "greenhouse"))
        .get(),
    ).toEqual({
      endpoints: {
        jobs: "https://greenhouse.example.test/custom/{slug}",
        posting: "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{externalId}",
      },
      updatedAt: backfilledAt,
    });
    expect(
      database
        .select({ endpoints: atsIntegrations.endpoints, updatedAt: atsIntegrations.updatedAt })
        .from(atsIntegrations)
        .where(eq(atsIntegrations.atsType, "lever"))
        .get(),
    ).toEqual({
      endpoints: {
        jobs: "https://lever.example.test/custom/{slug}",
        jobsEu: "https://lever.example.test/custom-eu/{slug}",
        posting: "https://api.lever.co/v0/postings/{slug}/{externalId}?mode=json",
        postingEu: "https://api.eu.lever.co/v0/postings/{slug}/{externalId}?mode=json",
      },
      updatedAt: backfilledAt,
    });
  });
});

function createDatabase(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}
