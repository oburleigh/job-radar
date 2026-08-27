import path from "node:path";
import Database from "better-sqlite3";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createJobDiscovery } from "@/contexts/discovery/application/discovery-runs/discover/discover-jobs";
import { SEARCH_STRATEGIES } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import { isVerifiedJobListing } from "@/contexts/discovery/domain/job-listing-provenance";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import type { AtsPostingLookup } from "@/contexts/discovery/infrastructure/job-sources/adapters";
import type {
  AtsType,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type { StructuredJobPageLookup } from "@/contexts/discovery/infrastructure/job-sources/structured-job-page";
import { classifyUrlWithConfig } from "@/contexts/discovery/infrastructure/job-sources/url-classification";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { createSqliteDiscoveryRunJournal } from "@/contexts/discovery/infrastructure/sqlite/discovery-run-journal";
import { getDashboardData } from "@/contexts/discovery/infrastructure/sqlite/read-models/dashboard";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  appSettings,
  atsIntegrations,
  discoveryHits,
  discoveryQueries,
  jobMatches,
  jobs,
  searchProfiles,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

import type {
  DiscoveryBenchmarkCorpus,
  DiscoveryBenchmarkExample,
  DiscoveryBenchmarkProfile,
} from "./corpus";
import {
  createDiscoveryBenchmarkReport,
  type DiscoveryBenchmarkObservation,
} from "./discovery-benchmark";

const requestTargets = {
  maxAsiaRequests: 111,
  minimumProductiveLocalRoleRate: 0.1,
} as const;

export async function runDiscoveryBenchmark(corpus: DiscoveryBenchmarkCorpus) {
  const {
    createSqliteDiscoverySetup,
    JsonSearchProvider,
    createSqliteJobDiscoveryCatalog,
    createSqliteJobMatchEvaluator,
  } = await loadProductionDependenciesWithoutOpeningConfiguredDatabase();
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });

  try {
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, corpus.benchmarkedAt);
    configureBenchmarkMarkets(database);
    configureBenchmarkVerificationSources(database);
    const integrationConfig = Object.fromEntries(
      database
        .select({
          atsType: atsIntegrations.atsType,
          hostnames: atsIntegrations.hostnames,
          hostSuffixes: atsIntegrations.hostSuffixes,
          priority: atsIntegrations.priority,
        })
        .from(atsIntegrations)
        .all()
        .map((integration) => [integration.atsType, integration]),
    );
    configureBenchmarkSources(database, corpus);

    const profileRuns = new Map<string, { readonly profileId: number; readonly runId: number }>();
    for (const profile of corpus.profiles) {
      const profileExamples = corpus.examples.filter((example) => example.profile === profile.name);
      const source = profile.source;
      const profileId = insertProfile(database, profile, corpus.benchmarkedAt);
      const fixture = createFixtureLookup(profileExamples, integrationConfig);
      const discovery = createJobDiscovery({
        setup: createSqliteDiscoverySetup(database),
        runs: createSqliteDiscoveryRunJournal(database),
        knownBoards: {
          countEnabledBoards: () => 0,
          synchronizeEnabledBoards: async () => [],
        },
        jobs: createSqliteJobDiscoveryCatalog(database, {
          lookupAtsPosting: fixture.lookupAtsPosting,
          lookupStructuredJobPage: fixture.lookupStructuredJobPage,
        }),
        matches: createSqliteJobMatchEvaluator(database),
        providers: {
          get: () =>
            new JsonSearchProvider(
              profileExamples
                .filter((example) => example.providerReturned)
                .map((example) => ({
                  title: example.job.title,
                  url: example.url,
                  snippet: example.job.description,
                })),
            ),
        },
        now: () => corpus.benchmarkedAt,
        yieldControl: async () => {},
      });
      const summary = await discovery.discoverJobs({
        profileId,
        providerName: "json",
        source,
        syncBoards: false,
      });
      profileRuns.set(profile.name, { profileId, runId: summary.runId });
    }

    const observations = readObservations(database, corpus, profileRuns, integrationConfig);
    const benchmark = createDiscoveryBenchmarkReport(corpus.profiles, observations);
    const requestProfiles = corpus.profiles.map((profile) => {
      const run = profileRuns.get(profile.name);
      if (!run) {
        throw new Error(`Benchmark profile ${profile.name} has no discovery run`);
      }
      const queries = database
        .select()
        .from(discoveryQueries)
        .where(eq(discoveryQueries.runId, run.runId))
        .orderBy(asc(discoveryQueries.id))
        .all();
      const localRoleRequests = queries.filter(
        (query) => query.laneKind === "role" && query.status === "completed",
      );
      const productiveLocalRoleRequests = localRoleRequests.filter(
        (query) => query.usefulHitCount > 0,
      );
      return {
        profile: profile.name,
        market: profile.market,
        totalRequests: queries.length,
        completedRequests: queries.filter((query) => query.status === "completed").length,
        localRoleRequests: localRoleRequests.length,
        productiveLocalRoleRequests: productiveLocalRoleRequests.length,
        productiveLocalRoleRate: ratio(
          productiveLocalRoleRequests.length,
          localRoleRequests.length,
        ),
        completedRoleStrategies: SEARCH_STRATEGIES.filter((strategy) =>
          localRoleRequests.some((query) => query.strategy === strategy),
        ),
      };
    });
    const legacyFormula = corpus.legacyAsiaRequestBaseline;
    const legacyFormulaIsExact =
      legacyFormula.totalRequests ===
      legacyFormula.titleTerms * legacyFormula.sources * legacyFormula.variantsPerTitleSource +
        legacyFormula.boardDiscoveryRequests;
    const requestTargetsMet =
      legacyFormulaIsExact &&
      requestProfiles.every(
        (profile) =>
          profile.completedRoleStrategies.length === SEARCH_STRATEGIES.length &&
          profile.productiveLocalRoleRate >= requestTargets.minimumProductiveLocalRoleRate &&
          (profile.market !== "Asia" || profile.totalRequests <= requestTargets.maxAsiaRequests),
      );

    return {
      ...benchmark,
      requestEvidence: {
        targets: requestTargets,
        legacyAsiaBaseline: legacyFormula,
        profiles: requestProfiles,
        targetsMet: requestTargetsMet,
      },
      passed: benchmark.passed && requestTargetsMet,
    };
  } finally {
    sqlite.close();
  }
}

async function loadProductionDependenciesWithoutOpeningConfiguredDatabase() {
  const configuredDatabasePath = process.env.DB_PATH;
  process.env.DB_PATH = ":memory:";
  try {
    const [configuration, search, catalog, matching] = await Promise.all([
      import("@/contexts/discovery/infrastructure/configuration/sqlite-discovery-setup"),
      import("@/contexts/discovery/infrastructure/search/web-search-provider"),
      import("@/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog"),
      import("@/contexts/discovery/infrastructure/sqlite/sqlite-job-match-evaluator"),
    ]);
    return {
      createSqliteDiscoverySetup: configuration.createSqliteDiscoverySetup,
      JsonSearchProvider: search.JsonSearchProvider,
      createSqliteJobDiscoveryCatalog: catalog.createSqliteJobDiscoveryCatalog,
      createSqliteJobMatchEvaluator: matching.createSqliteJobMatchEvaluator,
    };
  } finally {
    if (configuredDatabasePath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = configuredDatabasePath;
    }
  }
}

type BenchmarkDatabase = typeof db;

function configureBenchmarkMarkets(database: BenchmarkDatabase): void {
  database
    .update(appSettings)
    .set({
      value: {
        markets: [
          {
            key: "country:GB",
            aliases: ["United Kingdom", "UK"],
            covers: ["city:GB:london"],
            searchLanguage: "en",
          },
          { key: "city:GB:london", label: "London", aliases: [] },
          {
            key: "country:AE",
            aliases: ["UAE"],
            covers: ["subdivision:AE-AZ", "subdivision:AE-DU"],
            searchLanguage: "en",
          },
          { key: "subdivision:AE-AZ", label: "Abu Dhabi", aliases: [] },
          { key: "subdivision:AE-DU", label: "Dubai", aliases: [] },
          { key: "country:SG", aliases: [], searchLanguage: "en" },
        ],
      },
    })
    .where(eq(appSettings.key, "marketVocabulary"))
    .run();
}

function configureBenchmarkVerificationSources(database: BenchmarkDatabase): void {
  const setting = database
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "discovery"))
    .get();
  if (!setting || typeof setting.value !== "object" || setting.value === null) {
    throw new Error("Benchmark discovery settings are missing");
  }
  database
    .update(appSettings)
    .set({
      value: {
        ...setting.value,
        structuredVerificationSources: ["workday", "smartrecruiters"],
      },
    })
    .where(eq(appSettings.key, "discovery"))
    .run();
}

function configureBenchmarkSources(
  database: BenchmarkDatabase,
  corpus: DiscoveryBenchmarkCorpus,
): void {
  database.update(sourceDomains).set({ enabled: false }).run();
  const sources = corpus.profiles.map((profile) => ({
    atsType: profile.source,
    pattern: profile.sourcePattern,
  }));
  for (const [priority, source] of sources.entries()) {
    database
      .insert(sourceDomains)
      .values({ ...source, enabled: true, supportsBoardSync: false, priority })
      .onConflictDoUpdate({
        target: sourceDomains.pattern,
        set: { atsType: source.atsType, enabled: true, priority },
      })
      .run();
  }
}

function insertProfile(
  database: BenchmarkDatabase,
  profile: DiscoveryBenchmarkProfile,
  benchmarkedAt: Date,
): number {
  return database
    .insert(searchProfiles)
    .values({
      name: profile.name,
      titleTerms: [...profile.criteria.titleTerms],
      locationTerms: [...profile.criteria.locationTerms],
      requiredJobTerms: [...profile.criteria.requiredJobTerms],
      excludedTitleTerms: [...profile.criteria.excludedTitleTerms],
      excludedLocationTerms: [...profile.criteria.excludedLocationTerms],
      excludedDescriptionTerms: [...profile.criteria.excludedDescriptionTerms],
      includeRemote: profile.criteria.includeRemote,
      includeUnverified: profile.criteria.includeUnverified,
      salaryCurrency: profile.criteria.salaryCurrency ?? "",
      salaryMin: profile.criteria.salaryMin,
      salaryMax: profile.criteria.salaryMax,
      maxAgeDays: profile.criteria.maxAgeDays,
      minScore: profile.criteria.minScore,
      enabled: true,
      createdAt: benchmarkedAt,
      updatedAt: benchmarkedAt,
    })
    .returning({ id: searchProfiles.id })
    .get().id;
}

function createFixtureLookup(
  examples: readonly DiscoveryBenchmarkExample[],
  integrationConfig: Parameters<typeof classifyUrlWithConfig>[1],
) {
  const byPosting = new Map<string, DiscoveryBenchmarkExample>();
  for (const example of examples) {
    const classification = classifyUrlWithConfig(example.url, integrationConfig);
    if (classification?.externalId) {
      byPosting.set(`${classification.atsType}|${classification.externalId}`, example);
    }
  }
  const outcome = (atsType: AtsType, externalId: string, checkedUrl: string): AtsPostingLookup => {
    const example = byPosting.get(`${atsType}|${externalId}`);
    if (!example) {
      return { status: "not_found", reason: "fixture-not-found", checkedUrl };
    }
    if (!example.active) {
      return { status: "not_found", reason: "fixture-inactive", checkedUrl };
    }
    if (!isVerifiedJobListing(example.evidence)) {
      return { status: "protected", reason: "fixture-unverified", checkedUrl };
    }
    return { status: "verified", job: rawJob(example, externalId) };
  };
  return {
    lookupAtsPosting: async (
      board: { readonly atsType: AtsType },
      externalId: string,
    ): Promise<AtsPostingLookup> => outcome(board.atsType, externalId, "fixture://posting"),
    lookupStructuredJobPage: async (
      atsType: AtsType,
      externalId: string,
      canonicalUrl: string,
    ): Promise<StructuredJobPageLookup> => {
      const result = outcome(atsType, externalId, canonicalUrl);
      if (result.status === "verified") {
        return result;
      }
      if (result.status === "not_found") {
        return { status: "not_found", reason: "not-found" };
      }
      return { status: "unavailable", reason: "protected" };
    },
  };
}

function rawJob(example: DiscoveryBenchmarkExample, externalId: string): RawJob {
  return {
    atsType: example.source,
    externalId,
    canonicalUrl: example.url,
    applyUrl: example.url,
    companyName: "Benchmark Company",
    title: example.job.title,
    locations: [...example.job.locations],
    description: example.job.description,
    department: example.job.department,
    employmentType: "Full-time",
    workplaceType: example.job.workplaceType,
    publishedAt: example.job.publishedAt,
    publishedSalary: example.job.publishedSalary,
    evidence: example.evidence,
    rawPayload: { benchmarkExample: example.id },
  };
}

function readObservations(
  database: BenchmarkDatabase,
  corpus: DiscoveryBenchmarkCorpus,
  profileRuns: ReadonlyMap<string, { readonly profileId: number; readonly runId: number }>,
  integrationConfig: Parameters<typeof classifyUrlWithConfig>[1],
): DiscoveryBenchmarkObservation[] {
  const visibleRanks = new Map<string, number>();
  for (const { profileId } of profileRuns.values()) {
    getDashboardData({ profileId }, database).jobs.forEach((job, index) => {
      visibleRanks.set(profileJobKey(profileId, job.canonicalUrl), index + 1);
    });
  }

  return corpus.examples.map((example) => {
    const run = profileRuns.get(example.profile);
    const profile = corpus.profiles.find((candidate) => candidate.name === example.profile);
    if (!run || !profile) {
      throw new Error(
        `Benchmark example ${example.id} references unknown profile ${example.profile}`,
      );
    }
    const classification = classifyUrlWithConfig(example.url, integrationConfig);
    const hit = database
      .select()
      .from(discoveryHits)
      .where(eq(discoveryHits.runId, run.runId))
      .all()
      .find((candidate) => candidate.url === example.url);
    const job = classification?.externalId
      ? database
          .select()
          .from(jobs)
          .where(eq(jobs.externalId, classification.externalId))
          .all()
          .find((candidate) => candidate.atsType === example.source)
      : undefined;
    const match = job
      ? database
          .select()
          .from(jobMatches)
          .where(eq(jobMatches.profileId, run.profileId))
          .all()
          .find((candidate) => candidate.jobId === job.id)
      : undefined;
    const verification = !job
      ? "unverified"
      : !job.isActive
        ? "inactive"
        : isVerifiedJobListing(job.evidence)
          ? "verified"
          : "unverified";

    return {
      id: example.id,
      profile: profile.name,
      market: profile.market,
      track: profile.track,
      source: example.source,
      expectedVerification: example.expectedVerification,
      expectedMatch: example.expectedMatch,
      expectedVisible: example.expectedVisible,
      retrieved: hit !== undefined,
      classified: hit?.atsType === example.source,
      verification,
      match: match?.status ?? "not-evaluated",
      visibleRank:
        job === undefined
          ? null
          : (visibleRanks.get(profileJobKey(run.profileId, job.canonicalUrl)) ?? null),
    };
  });
}

function profileJobKey(profileId: number, canonicalUrl: string): string {
  return `${profileId}|${canonicalUrl}`;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
