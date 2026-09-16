import { describe, expect, it } from "vitest";

import type {
  ChangeApplicationStageResult,
  CreateNextActionCommand,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import {
  createApplicationDetailAction,
  type PlanRelationshipResult,
} from "./application-detail-action.server";

describe("Application detail action", () => {
  it("changes an Application stage through a validated localhost request", async () => {
    const received: unknown[] = [];
    const action = actionWith({
      changeApplicationStage(command) {
        received.push(command);
        return { status: "changed", stage: "applied" };
      },
    });

    await expect(action(localRequest(fields()))).resolves.toEqual({
      ok: true,
      message: "Application stage changed to Applied.",
    });
    expect(received).toEqual([{ applicationId: 41, stage: "applied", intent: "advance" }]);
  });

  it.each([
    [
      "invalid transition",
      {
        status: "rejected",
        reason: "invalid-stage-transition",
      } satisfies ChangeApplicationStageResult,
      "That Application stage change is not allowed.",
    ],
    [
      "unchanged stage",
      { status: "rejected", reason: "stage-unchanged" } satisfies ChangeApplicationStageResult,
      "The Application is already at that stage.",
    ],
    [
      "missing Application",
      { status: "application-not-found" } satisfies ChangeApplicationStageResult,
      "Application not found.",
    ],
  ])("reports an %s without claiming a change", async (_label, result, message) => {
    const action = actionWith({ changeApplicationStage: () => result });
    await expect(action(localRequest(fields()))).resolves.toEqual({ ok: false, message });
  });

  it("rejects invalid input before calling the workflow", async () => {
    let calls = 0;
    const action = actionWith({
      changeApplicationStage() {
        calls += 1;
        return { status: "application-not-found" };
      },
    });
    const invalid = fields();
    invalid.set("applicationId", "0");
    await expect(action(localRequest(invalid))).resolves.toEqual({
      ok: false,
      message: "Check the Application stage change and try again.",
    });
    expect(calls).toBe(0);
  });

  it("rejects remote mutation requests", async () => {
    const action = actionWith({
      changeApplicationStage: () => ({ status: "application-not-found" }),
    });
    await expect(action(localRequest(fields(), "jobs.example.test"))).rejects.toThrow(
      /restricted to localhost/,
    );
  });

  it("creates and completes a manual Next action", async () => {
    const created: CreateNextActionCommand[] = [];
    const action = actionWith({
      createNextAction(command) {
        created.push(command);
        return {
          status: "created",
          action: {
            id: 17,
            applicationId: 41,
            title: command.title,
            reason: command.reason,
            state: "open",
            dueAt: command.dueAt ?? null,
            createdAt: new Date("2026-09-14T17:00:00.000Z"),
          },
        };
      },
      changeNextAction: () => ({ status: "changed", state: "completed" }),
    });
    const createFields = new FormData();
    createFields.set("intent", "create-next-action");
    createFields.set("applicationId", "41");
    createFields.set("title", "Prepare interview examples");
    createFields.set("reason", "The Application has moved forward.");
    createFields.set("dueAt", "");
    await expect(action(localRequest(createFields))).resolves.toEqual({
      ok: true,
      message: "Next action created.",
    });
    expect(created).toEqual([
      {
        applicationId: 41,
        title: "Prepare interview examples",
        reason: "The Application has moved forward.",
      },
    ]);

    const completeFields = new FormData();
    completeFields.set("intent", "change-next-action");
    completeFields.set("actionId", "17");
    completeFields.set("changeKind", "complete");
    await expect(action(localRequest(completeFields))).resolves.toEqual({
      ok: true,
      message: "Next action completed.",
    });
  });

  it("passes browser cancellation to the Relationship-plan request", async () => {
    let received: AbortSignal | undefined;
    const action = actionWith({
      planRelationship: async (_applicationId, signal) => {
        received = signal;
        return { status: "disabled" };
      },
    });
    const fields = new FormData();
    fields.set("intent", "plan-relationship");
    fields.set("applicationId", "41");
    const request = localRequest(fields);
    await action(request);
    expect(received).toBe(request.signal);
  });

  it("requests a Relationship plan for the current Application", async () => {
    const applicationIds: number[] = [];
    const action = actionWith({
      async planRelationship(applicationId) {
        applicationIds.push(applicationId);
        return { status: "completed", plan: { summary: "Use the existing Prospect." } };
      },
    });
    const planFields = new FormData();
    planFields.set("intent", "plan-relationship");
    planFields.set("applicationId", "41");

    await expect(action(localRequest(planFields))).resolves.toEqual({
      ok: true,
      message: "Relationship plan completed.",
    });
    expect(applicationIds).toEqual([41]);
  });

  it("accepts or dismisses a Recommendation only through the Application workflow", async () => {
    const accepted: unknown[] = [];
    const dismissed: unknown[] = [];
    const action = actionWith({
      acceptRecommendation(command) {
        accepted.push(command);
        return {
          status: "accepted",
          action: {
            id: 19,
            applicationId: 41,
            title: "Review the public evidence",
            reason: "Confirm the suggested relationship.",
            state: "open",
            dueAt: null,
            createdAt: new Date("2026-09-14T18:00:00.000Z"),
          },
        };
      },
      dismissRecommendation(command) {
        dismissed.push(command);
        return { status: "dismissed" };
      },
    });
    const acceptFields = new FormData();
    acceptFields.set("intent", "accept-recommendation");
    acceptFields.set("applicationId", "41");
    acceptFields.set("recommendationId", "23");
    acceptFields.set("dueAt", "");
    await expect(action(localRequest(acceptFields))).resolves.toEqual({
      ok: true,
      message: "Recommendation accepted as a Next action.",
    });
    expect(accepted).toEqual([{ applicationId: 41, recommendationId: 23 }]);

    const dismissFields = new FormData();
    dismissFields.set("intent", "dismiss-recommendation");
    dismissFields.set("applicationId", "41");
    dismissFields.set("recommendationId", "24");
    await expect(action(localRequest(dismissFields))).resolves.toEqual({
      ok: true,
      message: "Recommendation dismissed.",
    });
    expect(dismissed).toEqual([{ applicationId: 41, recommendationId: 24 }]);
  });

  it.each([
    [
      "disabled Advisor",
      { status: "disabled" } satisfies PlanRelationshipResult,
      "Advisor is disabled in Settings.",
    ],
    [
      "missing Application",
      { status: "application-not-found" } satisfies PlanRelationshipResult,
      "Application not found.",
    ],
    [
      "missing Opportunity snapshot",
      { status: "opportunity-not-found" } satisfies PlanRelationshipResult,
      "The Application's Opportunity snapshot is unavailable.",
    ],
    [
      "unsupported relationship evidence",
      {
        status: "rejected",
        reason: "unsupported-relationship-reference",
      } satisfies PlanRelationshipResult,
      "Advisor reply failed relationship evidence validation.",
    ],
    [
      "Advisor failure",
      { status: "failed", message: "Timed out" } satisfies PlanRelationshipResult,
      "Advisor could not complete the Relationship plan. Check the Advisor settings and try again.",
    ],
  ])("reports %s without claiming a completed plan", async (_label, result, message) => {
    const action = actionWith({ planRelationship: async () => result });
    const planFields = new FormData();
    planFields.set("intent", "plan-relationship");
    planFields.set("applicationId", "41");
    await expect(action(localRequest(planFields))).resolves.toEqual({ ok: false, message });
  });

  it("rejects an invalid Relationship plan request before calling the workflow", async () => {
    let calls = 0;
    const action = actionWith({
      planRelationship: async () => {
        calls += 1;
        return { status: "application-not-found" };
      },
    });
    const planFields = new FormData();
    planFields.set("intent", "plan-relationship");
    planFields.set("applicationId", "not-an-application");

    await expect(action(localRequest(planFields))).resolves.toEqual({
      ok: false,
      message: "Check the Relationship plan request and try again.",
    });
    expect(calls).toBe(0);
  });
});

function actionWith(overrides: Partial<Parameters<typeof createApplicationDetailAction>[0]>) {
  return createApplicationDetailAction({
    changeApplicationStage: () => ({ status: "application-not-found" }),
    createNextAction: () => ({ status: "application-not-found" }),
    changeNextAction: () => ({ status: "next-action-not-found" }),
    acceptRecommendation: () => ({ status: "recommendation-not-found" }),
    dismissRecommendation: () => ({ status: "recommendation-not-found" }),
    planRelationship: async () => ({ status: "application-not-found" }),
    ...overrides,
  });
}

function fields(): FormData {
  const fields = new FormData();
  fields.set("intent", "change-application-stage");
  fields.set("applicationId", "41");
  fields.set("stage", "applied");
  fields.set("changeIntent", "advance");
  return fields;
}

function localRequest(fields: FormData, host = "127.0.0.1:5173"): Request {
  return new Request("http://127.0.0.1:5173/applications/41", {
    method: "POST",
    headers: { host },
    body: fields,
  });
}
