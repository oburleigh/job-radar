import type {
  AcceptRecommendationCommand,
  AcceptRecommendationResult,
  ChangeApplicationStageCommand,
  ChangeApplicationStageResult,
  ChangeNextActionCommand,
  ChangeNextActionResult,
  CreateNextActionCommand,
  CreateNextActionResult,
  DismissRecommendationCommand,
  DismissRecommendationResult,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { parseApplicationStageChangeRequest } from "@/contexts/opportunity-tracking/presentation/web/requests/application-stage-change-request";
import {
  parseAcceptRecommendationRequest,
  parseChangeNextActionRequest,
  parseCreateNextActionRequest,
  parseDismissRecommendationRequest,
} from "@/contexts/opportunity-tracking/presentation/web/requests/next-action-request";
import { parseRelationshipPlanRequest } from "@/contexts/opportunity-tracking/presentation/web/requests/relationship-plan-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

export type PlanRelationshipResult =
  | { readonly status: "completed"; readonly plan: unknown }
  | { readonly status: "disabled" }
  | { readonly status: "application-not-found" }
  | { readonly status: "opportunity-not-found" }
  | { readonly status: "rejected"; readonly reason: "unsupported-relationship-reference" }
  | { readonly status: "failed"; readonly message: string };

export function createApplicationDetailAction(dependencies: {
  readonly changeApplicationStage: (
    command: ChangeApplicationStageCommand,
  ) => ChangeApplicationStageResult;
  readonly createNextAction: (command: CreateNextActionCommand) => CreateNextActionResult;
  readonly changeNextAction: (command: ChangeNextActionCommand) => ChangeNextActionResult;
  readonly acceptRecommendation: (
    command: AcceptRecommendationCommand,
  ) => AcceptRecommendationResult;
  readonly dismissRecommendation: (
    command: DismissRecommendationCommand,
  ) => DismissRecommendationResult;
  readonly planRelationship: (
    applicationId: number,
    signal?: AbortSignal,
  ) => Promise<PlanRelationshipResult>;
}) {
  return async (request: Request) => {
    assertLocalHost(request.headers.get("host") ?? "");
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "accept-recommendation") {
      const parsed = parseAcceptRecommendationRequest(formData);
      if (!parsed.ok) return parsed;
      const result = dependencies.acceptRecommendation(parsed.command);
      return recommendationDecisionResult(result, "Recommendation accepted as a Next action.");
    }
    if (intent === "dismiss-recommendation") {
      const parsed = parseDismissRecommendationRequest(formData);
      if (!parsed.ok) return parsed;
      const result = dependencies.dismissRecommendation(parsed.command);
      return recommendationDecisionResult(result, "Recommendation dismissed.");
    }
    if (intent === "create-next-action") {
      const parsed = parseCreateNextActionRequest(formData);
      if (!parsed.ok) return parsed;
      const result = dependencies.createNextAction(parsed.command);
      return result.status === "created"
        ? { ok: true as const, message: "Next action created." }
        : { ok: false as const, message: "Application not found." };
    }
    if (intent === "change-next-action") {
      const parsed = parseChangeNextActionRequest(formData);
      if (!parsed.ok) return parsed;
      const result = dependencies.changeNextAction(parsed.command);
      if (result.status === "changed") {
        return { ok: true as const, message: nextActionChangeMessage(parsed.command.change.kind) };
      }
      return {
        ok: false as const,
        message:
          result.status === "next-action-not-found"
            ? "Next action not found."
            : "That Next action change is not allowed.",
      };
    }
    if (intent === "plan-relationship") {
      const parsed = parseRelationshipPlanRequest(formData);
      if (!parsed.ok) return parsed;
      const result = await dependencies.planRelationship(parsed.applicationId, request.signal);
      if (result.status === "completed") {
        return { ok: true as const, message: "Relationship plan completed." };
      }
      return { ok: false as const, message: relationshipPlanFailureMessage(result) };
    }
    const parsed = parseApplicationStageChangeRequest(formData);
    if (!parsed.ok) return parsed;

    const result = dependencies.changeApplicationStage(parsed.command);
    if (result.status === "changed") {
      return {
        ok: true as const,
        message: `Application stage changed to ${titleCase(result.stage)}.`,
      };
    }
    if (result.status === "application-not-found") {
      return { ok: false as const, message: "Application not found." };
    }
    return {
      ok: false as const,
      message:
        result.reason === "stage-unchanged"
          ? "The Application is already at that stage."
          : "That Application stage change is not allowed.",
    };
  };
}

function recommendationDecisionResult(
  result: AcceptRecommendationResult | DismissRecommendationResult,
  message: string,
) {
  if (result.status === "accepted" || result.status === "dismissed") {
    return { ok: true as const, message };
  }
  return {
    ok: false as const,
    message:
      result.status === "recommendation-not-found"
        ? "Recommendation not found."
        : "Recommendation has already been decided.",
  };
}

function relationshipPlanFailureMessage(
  result: Exclude<PlanRelationshipResult, { readonly status: "completed" }>,
): string {
  if (result.status === "disabled") return "Advisor is disabled in Settings.";
  if (result.status === "application-not-found") return "Application not found.";
  if (result.status === "opportunity-not-found") {
    return "The Application's Opportunity snapshot is unavailable.";
  }
  if (result.status === "rejected") {
    return "Advisor reply failed relationship evidence validation.";
  }
  return "Advisor could not complete the Relationship plan. Check the Advisor settings and try again.";
}

function nextActionChangeMessage(kind: ChangeNextActionCommand["change"]["kind"]): string {
  const messages = {
    complete: "Next action completed.",
    dismiss: "Next action dismissed.",
    reopen: "Next action reopened.",
    defer: "Next action deferred.",
  } as const;
  return messages[kind];
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
