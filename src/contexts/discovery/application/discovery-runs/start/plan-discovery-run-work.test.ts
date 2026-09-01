import { describe, expect, it } from "vitest";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import { createDiscoveryRunWorkPlanner } from "./plan-discovery-run-work";

describe("plan discovery run work", () => {
  it("counts known boards and provider-backed web lanes", () => {
    const planner = createDiscoveryRunWorkPlanner({
      setup,
      boards: { countEnabledBoards: () => 3 },
    });

    expect(planner.plan({ profileId: 7, providerName: "serper" })).toEqual({
      knownBoardCount: 3,
      webRequestCount: 2,
    });
  });

  it("does not schedule web lanes without a provider", () => {
    const planner = createDiscoveryRunWorkPlanner({
      setup,
      boards: { countEnabledBoards: () => 1 },
    });

    expect(planner.plan({ profileId: 7, providerName: null })).toEqual({
      knownBoardCount: 1,
      webRequestCount: 0,
    });
  });

  it("does not schedule company boards when their refresh policy is off", () => {
    const planner = createDiscoveryRunWorkPlanner({
      setup: {
        load: (command) => ({
          ...setup.load(command),
          policy: { ...setup.load(command).policy, companyBoardRefreshEnabled: false },
        }),
      },
      boards: { countEnabledBoards: () => 946 },
    });

    expect(planner.plan({ profileId: 7, providerName: "serper" })).toEqual({
      knownBoardCount: 0,
      webRequestCount: 2,
    });
  });
});

const setup: DiscoverySetupReader = {
  load: () => ({
    profile: {
      id: 7,
      titleTerms: ["Staff Engineer"],
      markets: [
        {
          scope: { key: "country:AE", label: "United Arab Emirates", terms: ["UAE"] },
          countryCode: "AE",
          searchLanguage: "en",
        },
      ],
      excludedMarkets: [],
      includeRemote: false,
      maxAgeDays: 30,
    },
    sources: [{ atsType: "greenhouse", pattern: "boards.greenhouse.io", supportsBoardSync: true }],
    policy: {
      resultsPerQuery: 25,
      boardJobLimit: 200,
      companyBoardRefreshEnabled: true,
      searchFreshnessDays: 30,
      workYieldBatchSize: 25,
      strategies: ["role-first"],
      minimumUsefulHitsPerPage: 1,
      maxPagesPerLane: 2,
      maxRequestsPerRun: 50,
      worldwideRemoteTerms: ["Remote"],
    },
  }),
};
