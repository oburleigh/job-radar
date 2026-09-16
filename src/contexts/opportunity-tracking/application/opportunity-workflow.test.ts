import { describe, expect, it } from "vitest";

import {
  createOpportunityWorkflow,
  type OpportunityStore,
  type StoredNextAction,
} from "./opportunity-workflow";

describe("Opportunity workflow", () => {
  it("orders Today actions by urgency, due time, creation time, and identity", () => {
    const at = new Date("2026-09-14T12:00:00.000Z");
    const actions: StoredNextAction[] = [
      action(10, null, "2026-09-14T09:00:00.000Z"),
      action(9, null, "2026-09-14T08:00:00.000Z"),
      action(8, null, "2026-09-14T08:00:00.000Z"),
      action(7, "2026-09-15T00:00:00.000Z", "2026-09-14T08:00:00.000Z"),
      action(6, "2026-09-14T15:00:00.000Z", "2026-09-14T08:00:00.000Z"),
      action(5, "2026-09-14T13:00:00.000Z", "2026-09-14T09:00:00.000Z"),
      action(4, "2026-09-14T13:00:00.000Z", "2026-09-14T08:00:00.000Z"),
      action(3, "2026-09-14T13:00:00.000Z", "2026-09-14T08:00:00.000Z"),
      action(2, "2026-09-14T10:00:00.000Z", "2026-09-14T08:00:00.000Z"),
      action(1, "2026-09-14T12:00:00.000Z", "2026-09-14T08:00:00.000Z"),
    ];
    const workflow = createOpportunityWorkflow({
      now: () => at,
      opportunities: { findRankedOpportunity: () => null },
      store: storeWith({ listOpenActions: () => actions }),
    });

    expect(workflow.listTodayActions(at).map(({ id }) => id)).toEqual([
      2, 1, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(workflow.listTodayActions(at)[0]).not.toHaveProperty("createdAt");
  });

  it("rejects an unavailable Opportunity before asking the store to start an Application", () => {
    let starts = 0;
    const workflow = createOpportunityWorkflow({
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      opportunities: { findRankedOpportunity: () => null },
      store: storeWith({
        startApplication: () => {
          starts += 1;
          throw new Error("must not start");
        },
      }),
    });

    expect(
      workflow.startApplication({ searchProfileId: 7, jobListingId: 11, stage: "preparing" }),
    ).toEqual({ status: "opportunity-not-found" });
    expect(starts).toBe(0);
  });
});

function action(id: number, dueAt: string | null, createdAt: string): StoredNextAction {
  return {
    id,
    applicationId: 41,
    title: `Action ${id}`,
    reason: `Reason ${id}`,
    dueAt: dueAt ? new Date(dueAt) : null,
    createdAt: new Date(createdAt),
  };
}

function storeWith(overrides: Partial<OpportunityStore>): OpportunityStore {
  const unavailable = () => {
    throw new Error("Unexpected store call");
  };
  return {
    startApplication: unavailable,
    createNextAction: unavailable,
    changeApplicationStage: unavailable,
    changeNextAction: unavailable,
    listApplications: unavailable,
    listTimeline: unavailable,
    listOpenActions: unavailable,
    listApplicationActions: unavailable,
    listApplicationRecommendations: unavailable,
    acceptRecommendation: unavailable,
    dismissRecommendation: unavailable,
    ...overrides,
  };
}
