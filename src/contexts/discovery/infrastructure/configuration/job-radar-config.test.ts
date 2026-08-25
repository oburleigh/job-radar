import { describe, expect, it } from "vitest";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

import { defaultProviderExecutionSettings } from "./bootstrap-job-radar";
import {
  endpoint,
  getJobRadarConfig,
  hostMatches,
  parseDiscoverySettings,
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

  it("uses configured host matching and sync capability", () => {
    expect(hostMatches("workday", "acme.wd5.myworkdayjobs.com")).toBe(true);
    expect(hostMatches("linkedin", "uk.linkedin.com")).toBe(true);
    expect(supportsBoardSync("workday")).toBe(true);
    expect(supportsBoardSync("linkedin")).toBe(false);
  });

  it("loads the default provider execution policy from a legacy discovery row", () => {
    const original = getJobRadarConfig().discovery;
    const legacy = Object.fromEntries(
      Object.entries(original).filter(([key]) => key !== "providerExecution"),
    );

    expect(parseDiscoverySettings(legacy).providerExecution).toEqual(
      defaultProviderExecutionSettings,
    );
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
});
