import { describe, expect, it } from "vitest";

import type { RuntimeSettingsCommand } from "./command";
import { createSaveRuntimeSettings } from "./use-case";

describe("save runtime settings", () => {
  it("replaces the complete policy snapshot atomically at the application clock time", () => {
    const replacements: { settings: RuntimeSettingsCommand; at: Date }[] = [];
    const changedAt = new Date("2026-08-20T13:00:00.000Z");
    const save = createSaveRuntimeSettings({
      marketVocabulary: { isValid: () => true },
      settings: {
        replace: (settings, at) => replacements.push({ settings, at }),
      },
      now: () => changedAt,
    });
    const command = runtimeSettings();

    expect(save(command)).toEqual({ status: "saved" });
    expect(replacements).toEqual([{ settings: command, at: changedAt }]);
  });

  it("rejects settings outside the supported operating bounds", () => {
    const replacements: RuntimeSettingsCommand[] = [];
    const save = createSaveRuntimeSettings({
      marketVocabulary: { isValid: () => true },
      settings: { replace: (settings) => replacements.push(settings) },
      now: () => new Date(),
    });
    const command = runtimeSettings();

    expect(
      save({
        ...command,
        discovery: { ...command.discovery, resultsPerQuery: 101 },
      }),
    ).toEqual({
      status: "rejected",
      reason: "invalid-setting",
      field: "resultsPerQuery",
    });
    expect(replacements).toEqual([]);
  });

  it("keeps the current settings when the market vocabulary is invalid", () => {
    const replacements: RuntimeSettingsCommand[] = [];
    const save = createSaveRuntimeSettings({
      marketVocabulary: { isValid: () => false },
      settings: { replace: (settings) => replacements.push(settings) },
      now: () => new Date(),
    });

    expect(save(runtimeSettings())).toEqual({
      status: "rejected",
      reason: "invalid-setting",
      field: "marketVocabulary",
    });
    expect(replacements).toEqual([]);
  });
});

function runtimeSettings(): RuntimeSettingsCommand {
  return {
    network: { timeoutMs: 10_000, userAgent: "Job Radar test" },
    discovery: {
      resultsPerQuery: 20,
      boardJobLimit: 500,
      searchFreshnessDays: 30,
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
      structuredVerificationSources: [],
      closedListingMarkers: ["closed"],
    },
    matching: {
      exactTitleScore: 40,
      fullTokenScore: 30,
      partialTokenScore: 20,
      partialTokenThreshold: 0.5,
      locationScore: 20,
      remoteScore: 20,
      unknownDateScore: 5,
      freshnessMaxScore: 20,
      freshnessMinimumScore: 5,
      freshnessStepDays: 7,
      stopWords: [],
      genericTitleTerms: ["head"],
      remoteTerms: ["remote"],
      unrestrictedRemotePhrases: ["worldwide"],
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
    ui: { discoveryPollIntervalMs: 2_000, discoveryStaleAfterMs: 300_000 },
    searchProviders: {},
    integrationPolicy: { customPriority: 1_000 },
    profileDefaults: { maximumAgeDays: 30, minimumScore: 70, salaryCurrency: "" },
  };
}
