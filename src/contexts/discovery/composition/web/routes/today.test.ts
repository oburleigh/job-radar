import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contracts = vi.hoisted(() => ({
  listRankedOpportunities: vi.fn(),
  getOpportunitySnapshot: vi.fn(),
  listApplications: vi.fn(),
  listTodayActions: vi.fn(),
  ui: vi.fn(),
  activity: vi.fn(),
  applicationStages: ["preparing", "applied", "closed"],
}));
vi.mock("@/contexts/discovery/public-contract.server", () => ({
  discoveryOpportunityContract: contracts,
}));
vi.mock("@/contexts/opportunity-tracking/public-contract.server", () => ({
  opportunityTrackingContract: contracts,
}));

vi.mock("@/contexts/discovery/composition/discovery-web.server", () => ({
  discoveryWeb: { getUiSettings: contracts.ui },
}));
vi.mock("../activity-data.server", () => ({ loadActivityData: contracts.activity }));

import TodayPage, { loader } from "./today";

describe("Today sections", () => {
  it.each([false, true])(
    "distinguishes empty history from unavailable history (failure: %s)",
    async (failed) => {
      if (failed) contracts.activity.mockRejectedValue(new Error("unavailable"));
      const data = await loader({ request: new Request("http://localhost/") });
      const router = createMemoryRouter(
        [{ id: "today", path: "/", Component: TodayPage, loader }],
        { hydrationData: { loaderData: { today: data } } },
      );
      const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
      expect(html.includes("No runs recorded.")).toBe(!failed);
      if (failed) expect(html).toContain("System status could not load.");
      router.dispose();
    },
  );

  it.each([3, 5])(
    "shows at most the configured %i Next actions in the owner's urgency order",
    async (limit) => {
      contracts.ui.mockReturnValue({ todayNextActionLimit: limit });
      const ordered = [9, 4, 8, 2, 7, 1].map((id) => ({
        id,
        applicationId: 8,
        title: `Action ${id}`,
      }));
      contracts.listTodayActions.mockReturnValue(ordered);
      const result = await loader({ request: new Request("http://localhost/") });
      expect(result.actions.map((item) => item.id)).toEqual(
        ordered.slice(0, limit).map((item) => item.id),
      );
      expect(result.totalActions).toBe(6);
    },
  );
  it("links pipeline counts to the corresponding Application stage", async () => {
    contracts.listApplications.mockReturnValue([
      { id: 8, searchProfileId: 2, jobListingId: 11, stage: "preparing" },
      { id: 9, searchProfileId: 2, jobListingId: 12, stage: "closed" },
    ]);
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.pipeline).toEqual([
      { stage: "preparing", count: 1, href: "/applications?stage=preparing" },
      { stage: "applied", count: 0, href: "/applications?stage=applied" },
      { stage: "closed", count: 1, href: "/applications?stage=closed" },
    ]);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    contracts.ui.mockReturnValue({ todayNextActionLimit: 5 });
    contracts.activity.mockResolvedValue({ items: [], errors: [] });
    contracts.listApplications.mockReturnValue([
      { id: 8, searchProfileId: 2, jobListingId: 11, stage: "preparing" },
    ]);
    contracts.listTodayActions.mockReturnValue([]);
    contracts.listRankedOpportunities.mockReturnValue([
      { searchProfileId: 2, jobListingId: 11, title: "Already pursuing" },
      { searchProfileId: 3, jobListingId: 11, title: "Another profile" },
      { searchProfileId: 2, jobListingId: 12, title: "Awaiting decision" },
    ]);
  });

  it("shows ranked Opportunities awaiting a decision using the complete profile/listing pair", async () => {
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.opportunities.map((item) => item.title)).toEqual([
      "Another profile",
      "Awaiting decision",
    ]);
    expect(contracts.listApplications).toHaveBeenCalledTimes(1);
  });

  it("keeps ranked Opportunities visible with a warning when Applications fail", async () => {
    contracts.listApplications.mockImplementation(() => {
      throw new Error("unavailable");
    });
    const data = await loader({ request: new Request("http://localhost/") });
    expect(data.opportunities.map((item) => item.title)).toEqual([
      "Already pursuing",
      "Another profile",
      "Awaiting decision",
    ]);
    expect(data.opportunitiesError).toBeNull();
    const router = createMemoryRouter([{ id: "today", path: "/", Component: TodayPage, loader }], {
      hydrationData: { loaderData: { today: data } },
    });
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain("Awaiting decision");
    expect(html).toContain("Opportunities may include roles you are already pursuing.");
    expect(html).toContain("Applications could not load.");
    router.dispose();
  });

  it("keeps an Application visible even without an open Next action", async () => {
    contracts.getOpportunitySnapshot.mockReturnValue({ title: "Pursued role" });
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.applications).toEqual([
      expect.objectContaining({
        id: 8,
        stage: "preparing",
        opportunity: { title: "Pursued role" },
      }),
    ]);
    expect(result.actions).toEqual([]);
  });

  it("retains an Application link when its listing snapshot fails", async () => {
    contracts.getOpportunitySnapshot.mockImplementation(() => {
      throw new Error("unavailable");
    });
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.applications).toEqual([expect.objectContaining({ id: 8, opportunity: null })]);
  });

  it("keeps Next actions available when Priority Opportunities fail", async () => {
    contracts.listRankedOpportunities.mockImplementation(() => {
      throw new Error("unavailable");
    });
    contracts.listTodayActions.mockReturnValue([{ id: 7, applicationId: 8, title: "Prepare" }]);
    contracts.getOpportunitySnapshot.mockReturnValue(null);
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.actions).toEqual([expect.objectContaining({ id: 7, title: "Prepare" })]);
    expect(result.opportunitiesError).toBeTruthy();
  });

  it("keeps Priority Opportunities available when Next actions fail", async () => {
    contracts.listTodayActions.mockImplementation(() => {
      throw new Error("unavailable");
    });
    const result = await loader({ request: new Request("http://localhost/") });
    expect(result.opportunities).toHaveLength(2);
    expect(result.actionsError).toBeTruthy();
  });
});
