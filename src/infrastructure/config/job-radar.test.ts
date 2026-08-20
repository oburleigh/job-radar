import { describe, expect, it } from "vitest";

import { db } from "@/infrastructure/database/client";
import { sourceDomains } from "@/infrastructure/database/schema";

import { endpoint, getJobRadarConfig, hostMatches, supportsBoardSync } from "./job-radar";

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
});
