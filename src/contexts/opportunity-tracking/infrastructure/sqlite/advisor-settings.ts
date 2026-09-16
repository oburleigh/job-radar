import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";

import {
  type AdvisorPolicy,
  advisorReasoningEfforts,
} from "@/contexts/opportunity-tracking/application/advisor-workflow";
import { advisorSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

const policySchema = z
  .object({
    enabled: z.boolean(),
    model: z.string().trim().min(1),
    reasoningEffort: z.enum(advisorReasoningEfforts),
    timeoutMs: z.number().int().safe().min(1_000),
    outputLimit: z.number().int().safe().positive(),
    policyVersion: z.number().int().safe().positive(),
    schemaVersion: z.number().int().safe().positive(),
  })
  .strict();

export const defaultAdvisorPolicy: AdvisorPolicy = {
  enabled: false,
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  timeoutMs: 600_000,
  outputLimit: 20_000,
  policyVersion: 1,
  schemaVersion: 2,
};

export function bootstrapAdvisorSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now = new Date(),
): void {
  database
    .insert(advisorSettings)
    .values({ key: "default", value: defaultAdvisorPolicy, updatedAt: now })
    .onConflictDoNothing()
    .run();
}

export function getAdvisorPolicy<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
): AdvisorPolicy {
  const value = database
    .select({ value: advisorSettings.value })
    .from(advisorSettings)
    .where(eq(advisorSettings.key, "default"))
    .get()?.value;
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) throw new Error("Advisor settings are missing or invalid.");
  return parsed.data;
}

export function saveAdvisorSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  command: Pick<
    AdvisorPolicy,
    "enabled" | "model" | "reasoningEffort" | "timeoutMs" | "outputLimit"
  >,
  changedAt = new Date(),
): AdvisorPolicy {
  const current = getAdvisorPolicy(database);
  const next = policySchema.parse({
    ...current,
    ...command,
    schemaVersion: current.schemaVersion,
    policyVersion: current.policyVersion + 1,
  });
  database
    .update(advisorSettings)
    .set({ value: next, updatedAt: changedAt })
    .where(eq(advisorSettings.key, "default"))
    .run();
  return next;
}
