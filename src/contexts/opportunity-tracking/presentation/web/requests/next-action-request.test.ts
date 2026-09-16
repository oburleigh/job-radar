import { describe, expect, it } from "vitest";

import {
  parseAcceptRecommendationRequest,
  parseChangeNextActionRequest,
  parseCreateNextActionRequest,
  parseDismissRecommendationRequest,
} from "./next-action-request";

describe("Next action requests", () => {
  it("maps a manual Next action with a browser-local due time", () => {
    const fields = new FormData();
    fields.set("intent", "create-next-action");
    fields.set("applicationId", "41");
    fields.set("title", "Prepare interview examples");
    fields.set("reason", "The Application has moved forward.");
    fields.set("dueAt", "2026-09-16T10:00");
    expect(parseCreateNextActionRequest(fields)).toEqual({
      ok: true,
      command: {
        applicationId: 41,
        title: "Prepare interview examples",
        reason: "The Application has moved forward.",
        dueAt: new Date(2026, 8, 16, 10),
      },
    });
  });

  it("maps a completion without accepting extra state", () => {
    const fields = new FormData();
    fields.set("intent", "change-next-action");
    fields.set("actionId", "17");
    fields.set("changeKind", "complete");
    expect(parseChangeNextActionRequest(fields)).toEqual({
      ok: true,
      command: { actionId: 17, change: { kind: "complete" } },
    });
    fields.set("state", "open");
    expect(parseChangeNextActionRequest(fields)).toEqual({
      ok: false,
      message: "Check the Next action details and try again.",
    });
  });

  it("maps a deferral only with a valid due time", () => {
    const fields = new FormData();
    fields.set("intent", "change-next-action");
    fields.set("actionId", "17");
    fields.set("changeKind", "defer");
    for (const dueAt of ["", "not-a-date"]) {
      fields.set("dueAt", dueAt);
      expect(parseChangeNextActionRequest(fields).ok).toBe(false);
    }
    fields.set("dueAt", "2026-09-18T10:00");
    expect(parseChangeNextActionRequest(fields)).toEqual({
      ok: true,
      command: { actionId: 17, change: { kind: "defer", dueAt: new Date(2026, 8, 18, 10) } },
    });
  });

  it("maps accepting a Recommendation into a Next action with an optional due time", () => {
    const fields = new FormData();
    fields.set("intent", "accept-recommendation");
    fields.set("applicationId", "41");
    fields.set("recommendationId", "23");
    fields.set("dueAt", "2026-09-17T09:00");
    expect(parseAcceptRecommendationRequest(fields)).toEqual({
      ok: true,
      command: {
        applicationId: 41,
        recommendationId: 23,
        dueAt: new Date(2026, 8, 17, 9),
      },
    });
  });

  it("maps dismissing a Recommendation without accepting extra state", () => {
    const fields = new FormData();
    fields.set("intent", "dismiss-recommendation");
    fields.set("applicationId", "41");
    fields.set("recommendationId", "24");
    expect(parseDismissRecommendationRequest(fields)).toEqual({
      ok: true,
      command: { applicationId: 41, recommendationId: 24 },
    });
    fields.set("state", "dismissed");
    expect(parseDismissRecommendationRequest(fields)).toEqual({
      ok: false,
      message: "Check the Recommendation decision and try again.",
    });
  });
});
