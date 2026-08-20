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
});

function currentRuntimeSettings(): RuntimeSettingsCommand {
  return {
    network: { timeoutMs: 30_000, userAgent: "Job Radar test" },
    discovery: {
      resultsPerQuery: 20,
      boardJobLimit: 200,
      searchFreshnessDays: 0,
      workYieldBatchSize: 25,
      runHistoryLimit: 100,
      titleSearchMode: "title",
      structuredVerificationSources: ["web3-career"],
      closedListingMarkers: ["no longer available"],
    },
    ui: { discoveryPollIntervalMs: 3_000, discoveryStaleAfterMs: 300_000 },
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
    searchProviders: {
      test: {
        label: "Test search",
        endpoint: "https://example.com/search",
        maxResults: 20,
        parameters: {},
        apiKeyEnv: "TEST_SEARCH_API_KEY",
        enabled: true,
        priority: 10,
        titleSearchMode: null,
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
    titleSearchMode: config.discovery.titleSearchMode,
    structuredVerificationSources: config.discovery.structuredVerificationSources.join("\n"),
    closedListingMarkers: config.discovery.closedListingMarkers.join("\n"),
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
    customIntegrationPriority: String(config.integrationPolicy.customPriority),
    ...profileDefaults,
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  for (const [name, provider] of Object.entries(config.searchProviders)) {
    formData.set(`provider:${name}:endpoint`, provider.endpoint);
    formData.set(`provider:${name}:maxResults`, String(provider.maxResults));
    formData.set(`provider:${name}:titleSearchMode`, provider.titleSearchMode ?? "");
  }
  return formData;
}
