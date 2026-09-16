import { z } from "zod";

import type {
  AcceptRecommendationCommand,
  ChangeNextActionCommand,
  CreateNextActionCommand,
  DismissRecommendationCommand,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";

const dueTime = z.union([z.literal(""), z.iso.datetime({ local: true, offset: true })]);

const createSchema = z
  .object({
    intent: z.literal("create-next-action"),
    applicationId: z.coerce.number().int().safe().positive(),
    title: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    dueAt: dueTime,
  })
  .strict();

const changeSchema = z.discriminatedUnion("changeKind", [
  z
    .object({
      intent: z.literal("change-next-action"),
      actionId: z.coerce.number().int().safe().positive(),
      changeKind: z.enum(["complete", "dismiss", "reopen"]),
    })
    .strict(),
  z
    .object({
      intent: z.literal("change-next-action"),
      actionId: z.coerce.number().int().safe().positive(),
      changeKind: z.literal("defer"),
      dueAt: z.iso.datetime({ local: true, offset: true }),
    })
    .strict(),
]);

const acceptRecommendationSchema = z
  .object({
    intent: z.literal("accept-recommendation"),
    applicationId: z.coerce.number().int().safe().positive(),
    recommendationId: z.coerce.number().int().safe().positive(),
    dueAt: dueTime,
  })
  .strict();

const dismissRecommendationSchema = z
  .object({
    intent: z.literal("dismiss-recommendation"),
    applicationId: z.coerce.number().int().safe().positive(),
    recommendationId: z.coerce.number().int().safe().positive(),
  })
  .strict();

export function parseCreateNextActionRequest(
  formData: FormData,
):
  | { readonly ok: true; readonly command: CreateNextActionCommand }
  | { readonly ok: false; readonly message: string } {
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalidRequest();
  return {
    ok: true,
    command: {
      applicationId: parsed.data.applicationId,
      title: parsed.data.title,
      reason: parsed.data.reason,
      ...(parsed.data.dueAt ? { dueAt: new Date(parsed.data.dueAt) } : {}),
    },
  };
}

export function parseChangeNextActionRequest(
  formData: FormData,
):
  | { readonly ok: true; readonly command: ChangeNextActionCommand }
  | { readonly ok: false; readonly message: string } {
  const parsed = changeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalidRequest();
  return {
    ok: true,
    command: {
      actionId: parsed.data.actionId,
      change:
        parsed.data.changeKind === "defer"
          ? { kind: "defer", dueAt: new Date(parsed.data.dueAt) }
          : { kind: parsed.data.changeKind },
    },
  };
}

export function parseAcceptRecommendationRequest(
  formData: FormData,
):
  | { readonly ok: true; readonly command: AcceptRecommendationCommand }
  | { readonly ok: false; readonly message: string } {
  const parsed = acceptRecommendationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalidRecommendationDecision();
  return {
    ok: true,
    command: {
      applicationId: parsed.data.applicationId,
      recommendationId: parsed.data.recommendationId,
      ...(parsed.data.dueAt ? { dueAt: new Date(parsed.data.dueAt) } : {}),
    },
  };
}

export function parseDismissRecommendationRequest(
  formData: FormData,
):
  | { readonly ok: true; readonly command: DismissRecommendationCommand }
  | { readonly ok: false; readonly message: string } {
  const parsed = dismissRecommendationSchema.safeParse(Object.fromEntries(formData.entries()));
  return parsed.success
    ? {
        ok: true,
        command: {
          applicationId: parsed.data.applicationId,
          recommendationId: parsed.data.recommendationId,
        },
      }
    : invalidRecommendationDecision();
}

function invalidRequest() {
  return { ok: false as const, message: "Check the Next action details and try again." };
}

function invalidRecommendationDecision() {
  return { ok: false as const, message: "Check the Recommendation decision and try again." };
}
