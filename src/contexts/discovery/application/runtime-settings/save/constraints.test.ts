import { describe, expect, it } from "vitest";

import type { RuntimeSettingsCommand } from "./command";
import {
  findInvalidRuntimeSetting,
  type RuntimeNumericSetting,
  runtimeSettingConstraints,
} from "./constraints";

type SetNumericSetting = (
  settings: RuntimeSettingsCommand,
  value: number,
) => RuntimeSettingsCommand;

const setNumericSetting: Record<RuntimeNumericSetting, SetNumericSetting> = {
  timeoutMs: (settings, timeoutMs) => ({
    ...settings,
    network: { ...settings.network, timeoutMs },
  }),
  resultsPerQuery: (settings, resultsPerQuery) => ({
    ...settings,
    discovery: { ...settings.discovery, resultsPerQuery },
  }),
  boardJobLimit: (settings, boardJobLimit) => ({
    ...settings,
    discovery: { ...settings.discovery, boardJobLimit },
  }),
  searchFreshnessDays: (settings, searchFreshnessDays) => ({
    ...settings,
    discovery: { ...settings.discovery, searchFreshnessDays },
  }),
  workYieldBatchSize: (settings, workYieldBatchSize) => ({
    ...settings,
    discovery: { ...settings.discovery, workYieldBatchSize },
  }),
  runHistoryLimit: (settings, runHistoryLimit) => ({
    ...settings,
    discovery: { ...settings.discovery, runHistoryLimit },
  }),
  providerConcurrency: (settings, concurrency) => withProviderExecution(settings, { concurrency }),
  providerRequestsPerInterval: (settings, requestsPerInterval) =>
    withProviderExecution(settings, { requestsPerInterval }),
  providerIntervalMs: (settings, intervalMs) => withProviderExecution(settings, { intervalMs }),
  providerMaxAttempts: (settings, maxAttempts) => withProviderExecution(settings, { maxAttempts }),
  providerRetryMinDelayMs: withProviderRetryMinDelay,
  providerRetryMaxDelayMs: withProviderRetryMaxDelay,
  providerRetryMaxTimeMs: (settings, retryMaxTimeMs) =>
    withProviderExecution(settings, { retryMaxTimeMs }),
  discoveryPollIntervalMs: (settings, discoveryPollIntervalMs) => ({
    ...settings,
    ui: { ...settings.ui, discoveryPollIntervalMs },
  }),
  discoveryStaleAfterMs: (settings, discoveryStaleAfterMs) => ({
    ...settings,
    ui: { ...settings.ui, discoveryStaleAfterMs },
  }),
  exactTitleScore: (settings, exactTitleScore) => ({
    ...settings,
    matching: { ...settings.matching, exactTitleScore },
  }),
  fullTokenScore: (settings, fullTokenScore) => ({
    ...settings,
    matching: { ...settings.matching, fullTokenScore },
  }),
  partialTokenScore: (settings, partialTokenScore) => ({
    ...settings,
    matching: { ...settings.matching, partialTokenScore },
  }),
  partialTokenThreshold: (settings, partialTokenThreshold) => ({
    ...settings,
    matching: { ...settings.matching, partialTokenThreshold },
  }),
  locationScore: (settings, locationScore) => ({
    ...settings,
    matching: { ...settings.matching, locationScore },
  }),
  remoteScore: (settings, remoteScore) => ({
    ...settings,
    matching: { ...settings.matching, remoteScore },
  }),
  unknownDateScore: (settings, unknownDateScore) => ({
    ...settings,
    matching: { ...settings.matching, unknownDateScore },
  }),
  freshnessMaxScore: (settings, freshnessMaxScore) => ({
    ...settings,
    matching: { ...settings.matching, freshnessMaxScore },
  }),
  freshnessMinimumScore: (settings, freshnessMinimumScore) => ({
    ...settings,
    matching: { ...settings.matching, freshnessMinimumScore },
  }),
  freshnessStepDays: (settings, freshnessStepDays) => ({
    ...settings,
    matching: { ...settings.matching, freshnessStepDays },
  }),
  customIntegrationPriority: (settings, customPriority) => ({
    ...settings,
    integrationPolicy: { customPriority },
  }),
  maximumAgeDays: (settings, maximumAgeDays) => ({
    ...settings,
    profileDefaults: { ...settings.profileDefaults, maximumAgeDays },
  }),
  minimumScore: (settings, minimumScore) => ({
    ...settings,
    profileDefaults: { ...settings.profileDefaults, minimumScore },
  }),
  providerMaxResults: withProviderMaxResults,
};

function withProviderExecution(
  settings: RuntimeSettingsCommand,
  value: Partial<RuntimeSettingsCommand["discovery"]["providerExecution"]>,
): RuntimeSettingsCommand {
  return {
    ...settings,
    discovery: {
      ...settings.discovery,
      providerExecution: { ...settings.discovery.providerExecution, ...value },
    },
  };
}

function withProviderRetryMinDelay(
  settings: RuntimeSettingsCommand,
  retryMinDelayMs: number,
): RuntimeSettingsCommand {
  const valid =
    Number.isInteger(retryMinDelayMs) &&
    retryMinDelayMs >= runtimeSettingConstraints.providerRetryMinDelayMs.min &&
    retryMinDelayMs <= runtimeSettingConstraints.providerRetryMinDelayMs.max;
  return withProviderExecution(settings, {
    retryMinDelayMs,
    ...(valid
      ? {
          retryMaxDelayMs: Math.max(
            settings.discovery.providerExecution.retryMaxDelayMs,
            retryMinDelayMs,
          ),
        }
      : {}),
  });
}

function withProviderRetryMaxDelay(
  settings: RuntimeSettingsCommand,
  retryMaxDelayMs: number,
): RuntimeSettingsCommand {
  const valid =
    Number.isInteger(retryMaxDelayMs) &&
    retryMaxDelayMs >= runtimeSettingConstraints.providerRetryMaxDelayMs.min &&
    retryMaxDelayMs <= runtimeSettingConstraints.providerRetryMaxDelayMs.max;
  return withProviderExecution(settings, {
    retryMaxDelayMs,
    ...(valid
      ? {
          retryMinDelayMs: Math.min(
            settings.discovery.providerExecution.retryMinDelayMs,
            retryMaxDelayMs,
          ),
        }
      : {}),
  });
}

function withProviderMaxResults(
  settings: RuntimeSettingsCommand,
  maxResults: number,
): RuntimeSettingsCommand {
  const provider = settings.searchProviders.test;
  if (!provider) {
    throw new Error("The runtime-settings test fixture must include its test provider.");
  }
  return {
    ...settings,
    searchProviders: {
      ...settings.searchProviders,
      test: { ...provider, maxResults },
    },
  };
}

describe("runtime setting constraints", () => {
  it.each(Object.entries(runtimeSettingConstraints))(
    "accepts the inclusive %s boundaries",
    (field, constraint) => {
      const setting = field as RuntimeNumericSetting;

      expect(
        findInvalidRuntimeSetting(setNumericSetting[setting](runtimeSettings(), constraint.min)),
      ).toBeNull();
      expect(
        findInvalidRuntimeSetting(setNumericSetting[setting](runtimeSettings(), constraint.max)),
      ).toBeNull();
    },
  );

  it("requires the maximum retry delay to cover the first retry delay", () => {
    const settings = runtimeSettings();

    expect(
      findInvalidRuntimeSetting(
        withProviderExecution(settings, {
          retryMinDelayMs: 1_500,
          retryMaxDelayMs: 1_499,
        }),
      ),
    ).toBe("providerRetryMaxDelayMs");
    expect(
      findInvalidRuntimeSetting(
        withProviderExecution(settings, {
          retryMinDelayMs: 1_500,
          retryMaxDelayMs: 1_500,
        }),
      ),
    ).toBeNull();
  });

  it("rejects fractional provider concurrency independently of constraint metadata", () => {
    expect(
      findInvalidRuntimeSetting(withProviderExecution(runtimeSettings(), { concurrency: 1.5 })),
    ).toBe("providerConcurrency");
  });

  it.each(Object.entries(runtimeSettingConstraints))(
    "rejects %s outside its supported range",
    (field, constraint) => {
      const setting = field as RuntimeNumericSetting;

      expect(
        findInvalidRuntimeSetting(
          setNumericSetting[setting](runtimeSettings(), constraint.min - 1),
        ),
      ).toBe(setting);
      expect(
        findInvalidRuntimeSetting(
          setNumericSetting[setting](runtimeSettings(), constraint.max + 1),
        ),
      ).toBe(setting);
    },
  );

  it.each(Object.entries(runtimeSettingConstraints).filter(([, constraint]) => constraint.integer))(
    "rejects a fractional %s",
    (field, constraint) => {
      const setting = field as RuntimeNumericSetting;

      expect(
        findInvalidRuntimeSetting(
          setNumericSetting[setting](runtimeSettings(), constraint.min + 0.5),
        ),
      ).toBe(setting);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite numeric values",
    (value) => {
      expect(findInvalidRuntimeSetting(setNumericSetting.timeoutMs(runtimeSettings(), value))).toBe(
        "timeoutMs",
      );
    },
  );

  it.each([
    ["", null],
    ["GBP", null],
    ["gbp", "salaryCurrency"],
    ["GB", "salaryCurrency"],
    ["GBPP", "salaryCurrency"],
  ] as const)("validates salary currency %j", (salaryCurrency, expected) => {
    const settings = runtimeSettings();

    expect(
      findInvalidRuntimeSetting({
        ...settings,
        profileDefaults: { ...settings.profileDefaults, salaryCurrency },
      }),
    ).toBe(expected);
  });

  it.each([
    ["  x  ", "userAgent"],
    ["abc", null],
    ["x".repeat(200), null],
    ["x".repeat(201), "userAgent"],
  ] as const)("validates the user-agent boundary", (userAgent, expected) => {
    const settings = runtimeSettings();

    expect(
      findInvalidRuntimeSetting({ ...settings, network: { ...settings.network, userAgent } }),
    ).toBe(expected);
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
      titleSearchMode: "title",
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
    ui: { discoveryPollIntervalMs: 2_000, discoveryStaleAfterMs: 300_000 },
    searchProviders: {
      test: {
        label: "Test",
        endpoint: "https://example.com/search",
        maxResults: 20,
        parameters: {},
        apiKeyEnv: "TEST_API_KEY",
        enabled: true,
        priority: 1,
        titleSearchMode: null,
      },
    },
    integrationPolicy: { customPriority: 1_000 },
    profileDefaults: { maximumAgeDays: 30, minimumScore: 70, salaryCurrency: "" },
  };
}
