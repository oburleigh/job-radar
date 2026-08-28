import { z } from "zod";

import type { ResearchObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  ResearchRun,
  ResearchSourceFailure,
} from "@/contexts/recruiter-engagement/domain/research-run";

const date = z.date();
const observedAt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positiveInteger = z.number().int().safe().positive();
const requestAllowance = z
  .object({ firms: z.number().int().nonnegative(), recruiters: z.number().int().nonnegative() })
  .strict();
const evidence = z
  .object({
    adapterId: z.string().min(1),
    confidence: z.enum(["high", "medium", "low"]),
    excerpt: z.string().min(1).max(280),
    observedAt,
    policyVersion: z.string().min(1),
    sourceUrl: z.url().refine((value) => value.startsWith("https://")),
  })
  .strict();
const researchCriteria = z
  .object({
    geography: z.string().min(1).optional(),
    industries: z.array(z.string().min(1)).min(1),
    specialisms: z.array(z.string().min(1)).min(1),
    targetLocations: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .transform((criteria, context) => {
    const targetLocations =
      criteria.targetLocations ?? (criteria.geography ? [criteria.geography] : []);
    if (targetLocations.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Target locations are required.",
        path: ["targetLocations"],
      });
      return z.NEVER;
    }
    return {
      industries: criteria.industries,
      specialisms: criteria.specialisms,
      targetLocations,
    };
  });
const adapterPolicy = z
  .object({
    allowedPublicSourceScope: z.array(z.string().min(1)).min(1),
    authorization: z.object({ reference: z.string().min(1), reviewedOn: observedAt }).strict(),
    disabledBehavior: z.string().min(1),
    enabled: z.boolean(),
    execution: z
      .object({
        automaticRetry: z.boolean(),
        ephemeral: z.boolean(),
        model: z.string().min(1).nullable(),
        reasoningEffort: z.string().min(1).nullable(),
        sandboxMode: z.string().min(1),
        webSearchEnabled: z.boolean(),
      })
      .strict(),
    id: z.string().min(1),
    permittedOperations: z.array(z.string().min(1)).min(1),
    permittedPublicData: z.array(z.string().min(1)).min(1),
    rateLimit: z
      .object({
        stageRequestLimit: z.number().int().nonnegative(),
        subscriptionExhaustionBehavior: z.string().min(1),
      })
      .strict(),
    retention: z.object({ deletionRule: z.string().min(1), rule: z.string().min(1) }).strict(),
    version: z.string().min(1),
  })
  .strict();
const sourcePlan = z
  .object({
    entries: z
      .array(
        z
          .object({
            adapterId: z.string().min(1),
            allowedPublicSources: z.array(z.string().min(1)).min(1),
            id: z.string().min(1),
            policyVersion: z.string().min(1),
            stage: z.enum(["firms", "recruiters"]),
          })
          .strict(),
      )
      .min(1),
    id: z.string().min(1),
    stageRequestAllowance: requestAllowance,
    version: z.string().min(1),
  })
  .strict();
const researchBudget = z
  .object({
    firmTarget: positiveInteger,
    recruiterTarget: positiveInteger,
    stageRequestAllowance: requestAllowance,
  })
  .strict();
const budgetUsage = requestAllowance;
const budgetExhaustion = z
  .object({
    reason: z.literal("stage-request-allowance-reached"),
    stage: z.enum(["firms", "recruiters"]),
  })
  .strict()
  .nullable();
const firmObservation = z
  .object({
    companyName: z.string().min(1),
    evidence,
    industries: z.array(z.string().min(1)).min(1),
    kind: z.literal("firm"),
    reason: z.string().min(1),
    specialisms: z.array(z.string().min(1)).min(1),
    websiteUrl: z.url().refine((value) => value.startsWith("https://")),
  })
  .strict();
const recruiterObservation = z
  .object({
    companyName: z.string().min(1),
    evidence,
    kind: z.literal("recruiter"),
    linkedInUrl: z.url().refine((value) => value.startsWith("https://")),
    name: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();
const researchObservation = z.discriminatedUnion("kind", [firmObservation, recruiterObservation]);
const researchRun = z
  .object({
    brief: z
      .object({
        criteria: researchCriteria,
        description: z.string(),
        firmTarget: positiveInteger.optional(),
        recruiterTarget: positiveInteger,
      })
      .strict(),
    budget: researchBudget,
    budgetExhaustion,
    budgetUsage,
    checkpoint: z.enum(["firms", "recruiters", "completed"]),
    completionReason: z.string().nullable(),
    finishedAt: date.nullable(),
    id: z.string().min(1),
    policy: adapterPolicy,
    retryOfRunId: z.string().min(1).nullable(),
    sourcePlan,
    startedAt: date,
    status: z.enum([
      "pending",
      "running",
      "completed",
      "partial",
      "failed",
      "cancelled",
      "interrupted",
    ]),
    updatedAt: date,
  })
  .strict()
  .transform((value) => ({
    ...value,
    brief: {
      ...value.brief,
      firmTarget: value.brief.firmTarget ?? value.budget.firmTarget,
    },
  }));
const sourceFailure = z
  .object({
    message: z.string(),
    recordedAt: date,
    stage: z.enum(["firms", "recruiters"]),
  })
  .strict();

export function parsePersistedResearchRun(value: unknown): ResearchRun {
  return parsePersisted(researchRun, value, "research run");
}

export function parsePersistedObservation(value: unknown): ResearchObservation {
  return parsePersisted(researchObservation, value, "research observation");
}

export function parsePersistedSourceFailure(value: unknown): ResearchSourceFailure {
  return parsePersisted(sourceFailure, value, "research source failure");
}

function parsePersisted<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid persisted recruiter ${label}: ${issue?.path.join(".") || "value"} ${issue?.message || "is invalid"}.`,
    );
  }
  return parsed.data;
}
