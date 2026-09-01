import { describe, expect, it } from "vitest";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

import { defaultProviderExecutionSettings } from "./bootstrap-job-radar";
import {
  endpoint,
  getJobRadarConfig,
  hostMatches,
  optionalEndpoint,
  parseDiscoverySettings,
  parseMarketVocabulary,
  parseSearchProviders,
  supportsBoardSync,
} from "./job-radar-config";

describe("SQLite configuration", () => {
  it("loads every supported ATS adapter from the database", () => {
    const config = getJobRadarConfig();

    expect(Object.keys(config.ats)).toHaveLength(13);
    expect(db.select().from(sourceDomains).all()).toHaveLength(15);
    expect(config.ats["web3-career"]?.label).toBe("Web3 Career");
    expect(config.ats.cryptocurrencyjobs?.label).toBe("Cryptocurrency Jobs");
    expect(config.ats.cryptojobslist?.label).toBe("CryptoJobsList");
    expect(config.ui.discoveryPollIntervalMs).toBeGreaterThanOrEqual(1000);
    expect(config.ui.discoveryStaleAfterMs).toBeGreaterThan(config.ui.discoveryPollIntervalMs);
    expect(config.discovery.workYieldBatchSize).toBeGreaterThan(0);
    expect(config.discovery.runHistoryLimit).toBeGreaterThan(0);
    expect(config.discovery.companyBoardRefreshEnabled).toBe(true);
    expect(config.discovery.providerExecution).toEqual({
      concurrency: 2,
      requestsPerInterval: 5,
      intervalMs: 1_000,
      maxAttempts: 3,
      retryMinDelayMs: 500,
      retryMaxDelayMs: 4_000,
      retryMaxTimeMs: 100_000,
    });
    expect(config.integrationPolicy.customPriority).toBe(200);
    expect(config.marketVocabulary.markets[0]).toEqual({
      key: "country:AE",
      aliases: ["UAE"],
      covers: ["subdivision:AE-AZ", "subdivision:AE-DU"],
      searchLanguage: "en",
    });
    expect(config.profileDefaults).toEqual({
      maximumAgeDays: 30,
      minimumScore: 70,
      salaryCurrency: "",
    });
  });

  it("renders configured endpoints with encoded values", () => {
    expect(
      endpoint("smartrecruiters", "jobs", {
        slug: "Acme Group",
        offset: 0,
        limit: 100,
      }),
    ).toContain("Acme%20Group/postings?offset=0&limit=100");
  });

  it("returns no optional endpoint when an integration does not configure one", () => {
    expect(optionalEndpoint("greenhouse", "missing", { slug: "acme" })).toBeNull();
  });

  it("uses configured host matching and sync capability", () => {
    expect(hostMatches("workday", "acme.wd5.myworkdayjobs.com")).toBe(true);
    expect(hostMatches("linkedin", "uk.linkedin.com")).toBe(true);
    expect(supportsBoardSync("workday")).toBe(true);
    expect(supportsBoardSync("linkedin")).toBe(false);
  });

  it("loads the default provider execution policy from a legacy discovery row", () => {
    const original = getJobRadarConfig().discovery;
    const legacy = Object.fromEntries(
      Object.entries(original).filter(
        ([key]) =>
          ![
            "providerExecution",
            "minimumUsefulHitsPerPage",
            "maxPagesPerLane",
            "maxRequestsPerRun",
          ].includes(key),
      ),
    );

    const parsed = parseDiscoverySettings(legacy);

    expect(parsed.providerExecution).toEqual(defaultProviderExecutionSettings);
    expect(parsed).toMatchObject({
      companyBoardRefreshEnabled: true,
      minimumUsefulHitsPerPage: 1,
      maxPagesPerLane: 3,
      maxRequestsPerRun: 111,
    });
  });

  it("keeps an explicitly disabled company-board refresh policy", () => {
    expect(
      parseDiscoverySettings({
        ...getJobRadarConfig().discovery,
        companyBoardRefreshEnabled: false,
      }).companyBoardRefreshEnabled,
    ).toBe(false);
  });

  it("maps legacy title modes to ordered strategies", () => {
    const discovery = getJobRadarConfig().discovery;
    const legacyDiscovery = {
      ...discovery,
      strategies: undefined,
      titleSearchMode: "anywhere",
    };
    const provider = getJobRadarConfig().searchProviders.serper;
    if (!provider) throw new Error("Expected the Serper test configuration");

    expect(parseDiscoverySettings(legacyDiscovery).strategies).toEqual(["relaxed-title"]);
    expect(
      parseSearchProviders({
        serper: { ...provider, strategies: undefined, titleSearchMode: "title" },
      }).serper?.strategies,
    ).toEqual(["role-first", "location-first", "phrase"]);
  });

  it.each(["country", "search_lang", "ui_lang", "offset", "location", "gl", "hl", "start", "page"])(
    "rejects adapter-owned provider parameter %s",
    (key) => {
      const provider = getJobRadarConfig().searchProviders.serper;
      if (!provider) throw new Error("Expected the Serper test configuration");

      expect(() =>
        parseSearchProviders({
          serper: { ...provider, parameters: { [key]: "override" } },
        }),
      ).toThrow(/owned by the adapter/);
    },
  );

  it("rejects a provider location without a canonical market key", () => {
    const provider = getJobRadarConfig().searchProviders.serper;
    if (!provider) throw new Error("Expected the Serper test configuration");

    expect(() =>
      parseSearchProviders({
        serper: { ...provider, marketLocations: { Dubai: "Dubai, United Arab Emirates" } },
      }),
    ).toThrow(/country|subdivision|city/);
  });

  it("rejects duplicate configured search strategies", () => {
    const discovery = getJobRadarConfig().discovery;

    expect(() =>
      parseDiscoverySettings({ ...discovery, strategies: ["phrase", "phrase"] }),
    ).toThrow(/unique/);
  });

  it("rejects a provider policy whose maximum delay is below its first delay", () => {
    const original = getJobRadarConfig().discovery;
    const providerExecution = original.providerExecution;

    expect(() =>
      parseDiscoverySettings({
        ...original,
        providerExecution: {
          ...providerExecution,
          retryMinDelayMs: 4_000,
          retryMaxDelayMs: 500,
        },
      }),
    ).toThrow(/retryMaxDelayMs/);
  });

  it("validates configured market aliases and same-country coverage", () => {
    expect(
      parseMarketVocabulary({
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
      }),
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

  it.each([
    [
      "unknown ISO country",
      {
        markets: [{ key: "country:ZZ", aliases: [], covers: [], searchLanguage: "en" }],
      },
    ],
    [
      "missing covered market",
      {
        markets: [
          {
            key: "country:AE",
            aliases: [],
            covers: ["subdivision:AE-DU"],
            searchLanguage: "en",
          },
        ],
      },
    ],
    [
      "cross-country coverage",
      {
        markets: [
          {
            key: "country:AE",
            aliases: [],
            covers: ["subdivision:GB-LND"],
            searchLanguage: "en",
          },
          { key: "subdivision:GB-LND", label: "London", aliases: [] },
        ],
      },
    ],
    [
      "duplicate normalized alias",
      {
        markets: [
          {
            key: "country:AE",
            aliases: ["Dubai"],
            covers: ["subdivision:AE-DU"],
            searchLanguage: "en",
          },
          { key: "subdivision:AE-DU", label: " Dubai ", aliases: [] },
        ],
      },
    ],
    [
      "invalid language tag",
      {
        markets: [
          {
            key: "country:AE",
            aliases: [],
            covers: [],
            searchLanguage: "not_a_language",
          },
        ],
      },
    ],
  ])("rejects %s", (_case, value) => {
    expect(() => parseMarketVocabulary(value)).toThrow();
  });
});
