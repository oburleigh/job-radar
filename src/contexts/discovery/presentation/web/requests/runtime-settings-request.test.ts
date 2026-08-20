import { describe, expect, it } from "vitest";

import type { RuntimeSettingsCommand } from "@/contexts/discovery/application/runtime-settings/save/command";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

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
  const { network, discovery, matching, ui, searchProviders, integrationPolicy, profileDefaults } =
    getJobRadarConfig();
  return {
    network,
    discovery,
    matching,
    ui,
    searchProviders,
    integrationPolicy,
    profileDefaults,
  };
}

function runtimeSettingsForm(profileDefaults: {
  maximumAgeDays: string;
  minimumScore: string;
  salaryCurrency: string;
}): FormData {
  const config = getJobRadarConfig();
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
