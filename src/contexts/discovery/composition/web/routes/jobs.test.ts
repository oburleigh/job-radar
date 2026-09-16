import { beforeEach, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getAtsLabels: vi.fn(() => ({})),
  getDashboardData: vi.fn(),
  getSearchProviderOptions: vi.fn(() => []),
  listApplications: vi.fn(),
}));
vi.mock("@/contexts/discovery/composition/discovery-web.server", () => ({
  discoveryWeb: dependencies,
}));
vi.mock("@/contexts/opportunity-tracking/public-contract.server", () => ({
  opportunityTrackingContract: dependencies,
}));

import { loader } from "./jobs";

beforeEach(() => {
  dependencies.getDashboardData.mockReturnValue({
    profile: { id: 2 },
    jobs: [{ id: 11 }, { id: 12 }, { id: 13 }],
  });
  dependencies.listApplications.mockReturnValue([
    { id: 21, searchProfileId: 3, jobListingId: 11, stage: "applied" },
    { id: 22, searchProfileId: 2, jobListingId: 12, stage: "preparing" },
    { id: 23, searchProfileId: 2, jobListingId: 13, stage: "closed" },
  ]);
});

it("joins Applications to Opportunities by the complete profile/listing pair", () => {
  const result = loader({ request: new Request("http://localhost/opportunities?profile=2") });
  expect(result.dashboard.jobs).toEqual([
    { id: 11, application: null },
    { id: 12, application: { id: 22, stage: "preparing" } },
    { id: 13, application: { id: 23, stage: "closed" } },
  ]);
});

it("ignores the legacy applied query filter", () => {
  loader({ request: new Request("http://localhost/opportunities?profile=2&state=applied") });
  expect(dependencies.getDashboardData).toHaveBeenLastCalledWith({ profileId: 2 });
});
