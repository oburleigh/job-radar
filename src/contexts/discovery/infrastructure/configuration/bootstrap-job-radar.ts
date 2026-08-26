import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type {
  MarketVocabulary,
  RuntimeSettings,
} from "@/contexts/discovery/application/runtime-settings/settings";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  appSettings,
  atsIntegrations,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = BetterSQLite3Database<typeof schema>;

interface SettingDefault {
  readonly key: string;
  readonly value: unknown;
}

interface AtsIntegrationDefault {
  readonly atsType: AtsType;
  readonly label: string;
  readonly hostnames: string[];
  readonly hostSuffixes: string[];
  readonly supportsBoardSync: boolean;
  readonly priority: number;
  readonly pageSize: number | null;
  readonly endpoints: Record<string, string>;
}

interface SourceDomainDefault {
  readonly atsType: AtsType;
  readonly pattern: string;
  readonly enabled: boolean;
  readonly supportsBoardSync: boolean;
  readonly priority: number;
}

export const defaultProviderExecutionSettings = {
  concurrency: 2,
  requestsPerInterval: 5,
  intervalMs: 1_000,
  maxAttempts: 3,
  retryMinDelayMs: 500,
  retryMaxDelayMs: 4_000,
  retryMaxTimeMs: 100_000,
} as const satisfies RuntimeSettings["discovery"]["providerExecution"];

export const defaultAdaptivePaginationSettings = {
  minimumUsefulHitsPerPage: 1,
  maxPagesPerLane: 3,
  maxRequestsPerRun: 111,
} as const;

export const defaultMarketVocabulary = {
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
} as const satisfies MarketVocabulary;

const settingDefaults: SettingDefault[] = [
  {
    key: "network",
    value: {
      timeoutMs: 30000,
      userAgent: "JobRadar/1.0 (local application)",
    },
  },
  {
    key: "discovery",
    value: {
      resultsPerQuery: 20,
      boardJobLimit: 200,
      strategies: ["role-first", "location-first", "phrase", "relaxed-title"],
      ...defaultAdaptivePaginationSettings,
      searchFreshnessDays: 0,
      workYieldBatchSize: 25,
      runHistoryLimit: 100,
      providerExecution: defaultProviderExecutionSettings,
      structuredVerificationSources: ["web3-career", "cryptocurrencyjobs", "cryptojobslist"],
      closedListingMarkers: [
        "career opportunity is no longer available",
        "no longer accepting applications",
        "this job is no longer available",
        "this job is closed",
        "position has been filled",
      ],
    },
  },
  {
    key: "ui",
    value: {
      discoveryPollIntervalMs: 3000,
      discoveryStaleAfterMs: 300000,
    },
  },
  {
    key: "marketVocabulary",
    value: defaultMarketVocabulary,
  },
  {
    key: "matching",
    value: {
      exactTitleScore: 60,
      fullTokenScore: 50,
      partialTokenScore: 42,
      partialTokenThreshold: 0.8,
      locationScore: 30,
      remoteScore: 25,
      unknownDateScore: 5,
      freshnessMaxScore: 10,
      freshnessMinimumScore: 2,
      freshnessStepDays: 3,
      stopWords: ["a", "an", "and", "of", "the", "to"],
      genericTitleTerms: [
        "head",
        "vp",
        "vice",
        "president",
        "director",
        "senior",
        "manager",
        "principal",
        "chief",
        "lead",
      ],
      remoteTerms: ["remote"],
      unrestrictedRemotePhrases: [
        "work from anywhere",
        "anywhere in the world",
        "work remotely from anywhere",
        "globally remote",
        "global remote",
        "worldwide remote",
        "remote worldwide",
        "location agnostic",
      ],
    },
  },
  {
    key: "searchProviders",
    value: {
      serper: {
        label: "Google via Serper.dev",
        endpoint: "https://google.serper.dev/search",
        maxResults: 10,
        parameters: {},
        apiKeyEnv: "SERPER_API_KEY",
        enabled: true,
        priority: 10,
        strategies: ["role-first", "location-first", "phrase", "relaxed-title"],
        marketLocations: {
          "country:AE": "United Arab Emirates",
          "subdivision:AE-AZ": "Abu Dhabi, United Arab Emirates",
          "subdivision:AE-DU": "Dubai, United Arab Emirates",
        },
      },
      brave: {
        label: "Brave Search",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        maxResults: 20,
        parameters: {
          safesearch: "moderate",
          text_decorations: "false",
          spellcheck: "false",
          result_filter: "web",
        },
        apiKeyEnv: "BRAVE_SEARCH_API_KEY",
        enabled: true,
        priority: 20,
        strategies: null,
        marketLocations: {
          "country:AE": "United Arab Emirates",
          "subdivision:AE-AZ": "Abu Dhabi, United Arab Emirates",
          "subdivision:AE-DU": "Dubai, United Arab Emirates",
        },
      },
      serpapi: {
        label: "Google via SerpAPI",
        endpoint: "https://serpapi.com/search.json",
        maxResults: 100,
        parameters: { engine: "google" },
        apiKeyEnv: "SERPAPI_KEY",
        enabled: true,
        priority: 30,
        strategies: null,
        marketLocations: {
          "country:AE": "United Arab Emirates",
          "subdivision:AE-AZ": "Abu Dhabi, United Arab Emirates",
          "subdivision:AE-DU": "Dubai, United Arab Emirates",
        },
      },
    },
  },
  {
    key: "integrationPolicy",
    value: { customPriority: 200 },
  },
  {
    key: "profileDefaults",
    value: {
      maximumAgeDays: 30,
      minimumScore: 70,
      salaryCurrency: "",
    },
  },
];

const atsIntegrationDefaults: AtsIntegrationDefault[] = [
  {
    atsType: "ashby",
    label: "Ashby",
    hostnames: ["jobs.ashbyhq.com"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 10,
    pageSize: null,
    endpoints: {
      jobs: "https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true",
    },
  },
  {
    atsType: "greenhouse",
    label: "Greenhouse",
    hostnames: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 20,
    pageSize: null,
    endpoints: {
      jobs: "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true",
      posting: "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{externalId}",
    },
  },
  {
    atsType: "lever",
    label: "Lever",
    hostnames: ["jobs.lever.co", "jobs.eu.lever.co"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 30,
    pageSize: null,
    endpoints: {
      jobs: "https://api.lever.co/v0/postings/{slug}?mode=json",
      jobsEu: "https://api.eu.lever.co/v0/postings/{slug}?mode=json",
      posting: "https://api.lever.co/v0/postings/{slug}/{externalId}?mode=json",
      postingEu: "https://api.eu.lever.co/v0/postings/{slug}/{externalId}?mode=json",
    },
  },
  {
    atsType: "bamboohr",
    label: "BambooHR",
    hostnames: ["jobs.bamboohr.com"],
    hostSuffixes: [".bamboohr.com"],
    supportsBoardSync: true,
    priority: 40,
    pageSize: null,
    endpoints: { jobs: "https://{slug}.bamboohr.com/careers/list" },
  },
  {
    atsType: "workable",
    label: "Workable",
    hostnames: ["apply.workable.com", "careers.workable.com"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 50,
    pageSize: null,
    endpoints: { jobs: "https://apply.workable.com/api/v1/widget/accounts/{slug}" },
  },
  {
    atsType: "smartrecruiters",
    label: "SmartRecruiters",
    hostnames: ["jobs.smartrecruiters.com", "careers.smartrecruiters.com"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 60,
    pageSize: 100,
    endpoints: {
      jobs: "https://api.smartrecruiters.com/v1/companies/{slug}/postings?offset={offset}&limit={limit}",
    },
  },
  {
    atsType: "workday",
    label: "Workday",
    hostnames: [],
    hostSuffixes: [".myworkdayjobs.com"],
    supportsBoardSync: true,
    priority: 70,
    pageSize: 20,
    endpoints: { jobs: "https://{host}/wday/cxs/{tenant}/{site}/jobs" },
  },
  {
    atsType: "icims",
    label: "iCIMS",
    hostnames: ["careers.icims.com"],
    hostSuffixes: [".icims.com"],
    supportsBoardSync: false,
    priority: 80,
    pageSize: null,
    endpoints: {},
  },
  {
    atsType: "jobvite",
    label: "Jobvite",
    hostnames: ["jobs.jobvite.com"],
    hostSuffixes: [],
    supportsBoardSync: true,
    priority: 90,
    pageSize: null,
    endpoints: { jobs: "https://jobs.jobvite.com/{slug}/jobs/viewall" },
  },
  {
    atsType: "linkedin",
    label: "LinkedIn",
    hostnames: ["linkedin.com", "www.linkedin.com"],
    hostSuffixes: [".linkedin.com"],
    supportsBoardSync: false,
    priority: 100,
    pageSize: null,
    endpoints: {
      job: "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{externalId}",
    },
  },
  {
    atsType: "web3-career",
    label: "Web3 Career",
    hostnames: ["web3.career", "www.web3.career"],
    hostSuffixes: [],
    supportsBoardSync: false,
    priority: 110,
    pageSize: null,
    endpoints: {},
  },
  {
    atsType: "cryptocurrencyjobs",
    label: "Cryptocurrency Jobs",
    hostnames: ["cryptocurrencyjobs.co", "www.cryptocurrencyjobs.co"],
    hostSuffixes: [],
    supportsBoardSync: false,
    priority: 111,
    pageSize: null,
    endpoints: {},
  },
  {
    atsType: "cryptojobslist",
    label: "CryptoJobsList",
    hostnames: ["cryptojobslist.com", "www.cryptojobslist.com"],
    hostSuffixes: [],
    supportsBoardSync: false,
    priority: 112,
    pageSize: null,
    endpoints: {},
  },
];

const sourceDomainDefaults: SourceDomainDefault[] = [
  source("ashby", "jobs.ashbyhq.com", true, 10),
  source("greenhouse", "boards.greenhouse.io", true, 20),
  source("greenhouse", "job-boards.greenhouse.io", true, 21),
  source("lever", "jobs.lever.co", true, 30),
  source("bamboohr", "jobs.bamboohr.com", true, 40),
  source("workable", "apply.workable.com", true, 50),
  source("workable", "careers.workable.com", true, 51),
  source("smartrecruiters", "jobs.smartrecruiters.com", true, 60),
  source("workday", "myworkdayjobs.com", true, 70),
  source("icims", "careers.icims.com", false, 80),
  source("jobvite", "jobs.jobvite.com", true, 90),
  source("linkedin", "linkedin.com/jobs/view", false, 100),
  source("web3-career", "web3.career", false, 110),
  source("cryptocurrencyjobs", "cryptocurrencyjobs.co", false, 111),
  source("cryptojobslist", "cryptojobslist.com", false, 112),
];

export function bootstrapJobRadar(database: Database, now = new Date()): void {
  database.transaction((transaction) => {
    transaction
      .insert(appSettings)
      .values(settingDefaults.map((setting) => ({ ...setting, updatedAt: now })))
      .onConflictDoNothing()
      .run();
    const discovery = transaction
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "discovery"))
      .get()?.value;
    if (typeof discovery === "object" && discovery !== null && !Array.isArray(discovery)) {
      const missingDefaults = {
        ...(!("providerExecution" in discovery)
          ? { providerExecution: defaultProviderExecutionSettings }
          : {}),
        ...(!("minimumUsefulHitsPerPage" in discovery)
          ? { minimumUsefulHitsPerPage: defaultAdaptivePaginationSettings.minimumUsefulHitsPerPage }
          : {}),
        ...(!("maxPagesPerLane" in discovery)
          ? { maxPagesPerLane: defaultAdaptivePaginationSettings.maxPagesPerLane }
          : {}),
        ...(!("maxRequestsPerRun" in discovery)
          ? { maxRequestsPerRun: defaultAdaptivePaginationSettings.maxRequestsPerRun }
          : {}),
      };
      if (Object.keys(missingDefaults).length > 0) {
        transaction
          .update(appSettings)
          .set({
            value: { ...discovery, ...missingDefaults },
            updatedAt: now,
          })
          .where(eq(appSettings.key, "discovery"))
          .run();
      }
    }
    transaction
      .insert(atsIntegrations)
      .values(atsIntegrationDefaults.map((integration) => ({ ...integration, updatedAt: now })))
      .onConflictDoNothing()
      .run();
    for (const integration of atsIntegrationDefaults) {
      const existing = transaction
        .select({ endpoints: atsIntegrations.endpoints })
        .from(atsIntegrations)
        .where(eq(atsIntegrations.atsType, integration.atsType))
        .get();
      if (!existing) {
        continue;
      }
      const missingEndpoints = Object.fromEntries(
        Object.entries(integration.endpoints).filter(([name]) => !(name in existing.endpoints)),
      );
      if (Object.keys(missingEndpoints).length > 0) {
        transaction
          .update(atsIntegrations)
          .set({ endpoints: { ...existing.endpoints, ...missingEndpoints }, updatedAt: now })
          .where(eq(atsIntegrations.atsType, integration.atsType))
          .run();
      }
    }
    transaction.insert(sourceDomains).values(sourceDomainDefaults).onConflictDoNothing().run();
  });
}

function source(
  atsType: AtsType,
  pattern: string,
  supportsBoardSync: boolean,
  priority: number,
): SourceDomainDefault {
  return { atsType, pattern, enabled: true, supportsBoardSync, priority };
}
