import { describe, expect, it } from "vitest";

import type { RuntimeSettingsCommand } from "@/contexts/discovery/application/runtime-settings/save/command";

import { parseRuntimeSettingsRequest } from "./runtime-settings-request";

describe("runtime settings request", () => {
  it("maps profile defaults into an application command", () => {
    const current = currentRuntimeSettings();
    const result = parseRuntimeSettingsRequest(
      runtimeSettingsForm({
        maximumAgeDays: "45",
        minimumScore: "82",
        salaryCurrency: "AED",
      }),
      current,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.command.profileDefaults).toEqual({
      maximumAgeDays: 45,
      minimumScore: 82,
      salaryCurrency: "AED",
    });
  });

  it("rejects a default salary currency outside ISO 4217", () => {
    const result = parseRuntimeSettingsRequest(
      runtimeSettingsForm({
        maximumAgeDays: "45",
        minimumScore: "82",
        salaryCurrency: "ZZZ",
      }),
      currentRuntimeSettings(),
    );

    expect(result).toEqual({
      ok: false,
      field: "salaryCurrency",
      message: "Default salary currency must be a valid ISO 4217 code such as GBP.",
    });
  });

  it("identifies the provider field when retry delays are inconsistent", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("providerRetryMinDelayMs", "4000");
    formData.set("providerRetryMaxDelayMs", "500");

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toEqual({
      ok: false,
      field: "providerRetryMaxDelayMs",
      message: "Maximum retry delay must be at least the first retry delay.",
    });
  });

  it("accepts equal first and maximum retry delays", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("providerRetryMinDelayMs", "500");
    formData.set("providerRetryMaxDelayMs", "500");

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toMatchObject({
      ok: true,
    });
  });

  it("identifies an invalid provider execution field", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("providerMaxAttempts", "4");

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toMatchObject({
      ok: false,
      field: "providerMaxAttempts",
    });
  });

  it("maps provider execution limits into the application command", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("providerConcurrency", "3");
    formData.set("providerRequestsPerInterval", "8");
    formData.set("providerIntervalMs", "2000");
    formData.set("providerMaxAttempts", "2");
    formData.set("providerRetryMinDelayMs", "250");
    formData.set("providerRetryMaxDelayMs", "3000");
    formData.set("providerRetryMaxTimeMs", "45000");

    const result = parseRuntimeSettingsRequest(formData, currentRuntimeSettings());

    expect(result.ok && result.command.discovery.providerExecution).toEqual({
      concurrency: 3,
      requestsPerInterval: 8,
      intervalMs: 2_000,
      maxAttempts: 2,
      retryMinDelayMs: 250,
      retryMaxDelayMs: 3_000,
      retryMaxTimeMs: 45_000,
    });
  });

  it("maps validated adaptive pagination budgets", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("minimumUsefulHitsPerPage", "2");
    formData.set("maxPagesPerLane", "4");
    formData.set("maxRequestsPerRun", "88");

    const result = parseRuntimeSettingsRequest(formData, currentRuntimeSettings());

    expect(result.ok && result.command.discovery).toMatchObject({
      minimumUsefulHitsPerPage: 2,
      maxPagesPerLane: 4,
      maxRequestsPerRun: 88,
    });
  });

  it("rejects an out-of-range lane page cap", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("maxPagesPerLane", "0");

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toMatchObject({
      ok: false,
      field: "maxPagesPerLane",
    });
  });

  it("maps validated market vocabulary JSON into the application command", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set(
      "marketVocabulary",
      JSON.stringify({
        markets: [
          {
            key: "country:AE",
            aliases: ["UAE", "Emirates"],
            covers: ["subdivision:AE-DU"],
            searchLanguage: "en",
          },
          { key: "subdivision:AE-DU", label: "Dubai", aliases: [] },
        ],
      }),
    );

    const result = parseRuntimeSettingsRequest(formData, currentRuntimeSettings());

    expect(result.ok && result.command.marketVocabulary).toEqual({
      markets: [
        {
          key: "country:AE",
          aliases: ["UAE", "Emirates"],
          covers: ["subdivision:AE-DU"],
          searchLanguage: "en",
        },
        { key: "subdivision:AE-DU", label: "Dubai", aliases: [] },
      ],
    });
  });

  it("identifies malformed market vocabulary JSON", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("marketVocabulary", "{not-json");

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toEqual({
      ok: false,
      field: "marketVocabulary",
      message: "Market vocabulary must be valid JSON.",
    });
  });

  it("writes ordered strategy lists and validated provider market locations", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set("strategies", "phrase\nrole-first");
    formData.set("provider:test:strategies", "relaxed-title\nlocation-first");
    formData.set(
      "provider:test:marketLocations",
      JSON.stringify({ "country:AE": "United Arab Emirates" }),
    );

    const result = parseRuntimeSettingsRequest(formData, currentRuntimeSettings());

    expect(result.ok && result.command.discovery.strategies).toEqual(["phrase", "role-first"]);
    expect(result.ok && result.command.searchProviders.test).toMatchObject({
      strategies: ["relaxed-title", "location-first"],
      marketLocations: { "country:AE": "United Arab Emirates" },
    });
  });

  it("identifies a provider location with a non-canonical market key", () => {
    const formData = runtimeSettingsForm({
      maximumAgeDays: "45",
      minimumScore: "82",
      salaryCurrency: "AED",
    });
    formData.set(
      "provider:test:marketLocations",
      JSON.stringify({ Dubai: "Dubai, United Arab Emirates" }),
    );

    expect(parseRuntimeSettingsRequest(formData, currentRuntimeSettings())).toMatchObject({
      ok: false,
      field: "provider:test:marketLocations",
    });
  });
});

function currentRuntimeSettings(): RuntimeSettingsCommand {
  return {
    network: { timeoutMs: 30_000, userAgent: "Job Radar test" },
    discovery: {
      resultsPerQuery: 20,
      boardJobLimit: 200,
      companyBoardRefreshEnabled: false,
      searchFreshnessDays: 0,
      workYieldBatchSize: 25,
      runHistoryLimit: 100,
      providerExecution: {
        concurrency: 2,
        requestsPerInterval: 5,
        intervalMs: 1_000,
        maxAttempts: 3,
        retryMinDelayMs: 500,
        retryMaxDelayMs: 4_000,
        retryMaxTimeMs: 100_000,
      },
      strategies: ["role-first", "location-first", "phrase", "relaxed-title"],
      minimumUsefulHitsPerPage: 1,
      maxPagesPerLane: 3,
      maxRequestsPerRun: 111,
      structuredVerificationSources: ["web3-career"],
      closedListingMarkers: ["no longer available"],
    },
    ui: {
      discoveryNotificationDurationMs: 5_000,
      discoveryPollIntervalMs: 3_000,
      discoveryStaleAfterMs: 300_000,
    },
    matching: {
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
      stopWords: ["the"],
      genericTitleTerms: ["head"],
      remoteTerms: ["remote"],
      unrestrictedRemotePhrases: ["worldwide remote"],
    },
    marketVocabulary: {
      markets: [
        {
          key: "country:AE",
          aliases: ["UAE"],
          covers: ["subdivision:AE-DU"],
          searchLanguage: "en",
        },
        { key: "subdivision:AE-DU", label: "Dubai", aliases: [] },
      ],
    },
    searchProviders: {
      test: {
        label: "Test search",
        endpoint: "https://example.com/search",
        maxResults: 20,
        parameters: {},
        apiKeyEnv: "TEST_SEARCH_API_KEY",
        enabled: true,
        priority: 10,
        strategies: null,
        marketLocations: {},
      },
    },
    integrationPolicy: { customPriority: 200 },
    profileDefaults: { maximumAgeDays: 30, minimumScore: 70, salaryCurrency: "" },
  };
}

function runtimeSettingsForm(profileDefaults: {
  maximumAgeDays: string;
  minimumScore: string;
  salaryCurrency: string;
}): FormData {
  const config = currentRuntimeSettings();
  const formData = new FormData();
  const values: Record<string, string> = {
    timeoutMs: String(config.network.timeoutMs),
    userAgent: config.network.userAgent,
    resultsPerQuery: String(config.discovery.resultsPerQuery),
    boardJobLimit: String(config.discovery.boardJobLimit),
    searchFreshnessDays: String(config.discovery.searchFreshnessDays),
    workYieldBatchSize: String(config.discovery.workYieldBatchSize),
    runHistoryLimit: String(config.discovery.runHistoryLimit),
    providerConcurrency: String(config.discovery.providerExecution.concurrency),
    providerRequestsPerInterval: String(config.discovery.providerExecution.requestsPerInterval),
    providerIntervalMs: String(config.discovery.providerExecution.intervalMs),
    providerMaxAttempts: String(config.discovery.providerExecution.maxAttempts),
    providerRetryMinDelayMs: String(config.discovery.providerExecution.retryMinDelayMs),
    providerRetryMaxDelayMs: String(config.discovery.providerExecution.retryMaxDelayMs),
    providerRetryMaxTimeMs: String(config.discovery.providerExecution.retryMaxTimeMs),
    strategies: config.discovery.strategies.join("\n"),
    minimumUsefulHitsPerPage: String(config.discovery.minimumUsefulHitsPerPage),
    maxPagesPerLane: String(config.discovery.maxPagesPerLane),
    maxRequestsPerRun: String(config.discovery.maxRequestsPerRun),
    structuredVerificationSources: config.discovery.structuredVerificationSources.join("\n"),
    closedListingMarkers: config.discovery.closedListingMarkers.join("\n"),
    discoveryNotificationDurationMs: String(config.ui.discoveryNotificationDurationMs),
    discoveryPollIntervalMs: String(config.ui.discoveryPollIntervalMs),
    discoveryStaleAfterMs: String(config.ui.discoveryStaleAfterMs),
    exactTitleScore: String(config.matching.exactTitleScore),
    fullTokenScore: String(config.matching.fullTokenScore),
    partialTokenScore: String(config.matching.partialTokenScore),
    partialTokenThreshold: String(config.matching.partialTokenThreshold),
    locationScore: String(config.matching.locationScore),
    remoteScore: String(config.matching.remoteScore),
    unknownDateScore: String(config.matching.unknownDateScore),
    freshnessMaxScore: String(config.matching.freshnessMaxScore),
    freshnessMinimumScore: String(config.matching.freshnessMinimumScore),
    freshnessStepDays: String(config.matching.freshnessStepDays),
    stopWords: config.matching.stopWords.join("\n"),
    genericTitleTerms: config.matching.genericTitleTerms.join("\n"),
    remoteTerms: config.matching.remoteTerms.join("\n"),
    unrestrictedRemotePhrases: config.matching.unrestrictedRemotePhrases.join("\n"),
    marketVocabulary: JSON.stringify(config.marketVocabulary, null, 2),
    customIntegrationPriority: String(config.integrationPolicy.customPriority),
    ...profileDefaults,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  for (const [name, provider] of Object.entries(config.searchProviders)) {
    formData.set(`provider:${name}:endpoint`, provider.endpoint);
    formData.set(`provider:${name}:maxResults`, String(provider.maxResults));
    formData.set(`provider:${name}:strategies`, provider.strategies?.join("\n") ?? "");
    formData.set(
      `provider:${name}:marketLocations`,
      JSON.stringify(provider.marketLocations, null, 2),
    );
  }
  return formData;
}
