import { beforeEach, describe, expect, it, vi } from "vitest";

const sources = vi.hoisted(() => ({ discovery: vi.fn(), research: vi.fn(), advisor: vi.fn() }));
vi.mock("@/contexts/discovery/composition/discovery-web.server", () => ({
  discoveryWeb: {
    getRunsData: sources.discovery,
    getUiSettings: () => ({ discoveryPollIntervalMs: 3000 }),
    getRuntimeSettings: () => ({ discovery: { runHistoryLimit: 9 } }),
  },
}));
vi.mock("@/contexts/recruiter-engagement/public-contract.server", () => ({
  recruiterActivityContract: { listResearchRuns: sources.research },
}));
vi.mock("@/contexts/opportunity-tracking/public-contract.server", () => ({
  opportunityAdvisorContract: { listExecutions: sources.advisor },
}));

import { loader } from "./activity";

describe("Activity history", () => {
  beforeEach(() => {
    sources.discovery.mockReturnValue([]);
    sources.research.mockResolvedValue([]);
    sources.advisor.mockReturnValue([
      {
        id: 19,
        kind: "assessment",
        searchProfileId: 7,
        jobListingId: 11,
        applicationId: null,
        status: "failed",
        reason: "advisor-failed",
        retryOf: 17,
        policy: { model: "test-model", reasoningEffort: "high" },
        startedAt: new Date("2026-09-14T12:00:00.000Z"),
        finishedAt: new Date("2026-09-14T12:00:03.000Z"),
      },
    ]);
  });
  it("includes durable Advisor attempts with their owning link, timing, and retry lineage", async () => {
    const result = await loader();
    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "advisor",
        type: "Opportunity assessment",
        href: "/opportunities/7/11",
        retryOf: 17,
        active: false,
        outcome: expect.stringContaining("3000 ms"),
      }),
    ]);
    expect(sources.advisor).toHaveBeenCalledWith(9);
  });
  it("retains Advisor history when Recruiter Search history fails", async () => {
    sources.research.mockRejectedValue(new Error("Unavailable"));
    const result = await loader();
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual(["Recruiter Search history could not load."]);
  });
});
