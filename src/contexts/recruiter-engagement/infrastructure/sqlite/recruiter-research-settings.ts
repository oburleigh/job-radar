import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import { recruiterResearchSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

const positiveInteger = z.number().int().safe().positive();
const nonEmptyItems = z.array(z.string().trim().min(1)).min(1);
const settingsSchema = z
  .object({
    defaultBrief: z
      .object({
        criteria: z.object({ industries: nonEmptyItems, specialisms: nonEmptyItems }).strict(),
        description: z.string().trim().min(1).max(1_000),
        firmTarget: positiveInteger,
        recruiterTarget: positiveInteger,
      })
      .strict(),
    execution: z
      .object({
        model: z.string().trim().min(1).nullable(),
        reasoningEffort: z.string().trim().min(1).nullable(),
        stageRequestLimit: positiveInteger,
        stageTimeoutMs: positiveInteger,
      })
      .strict(),
  })
  .strict()
  .refine((settings) => settings.defaultBrief.firmTarget <= settings.defaultBrief.recruiterTarget, {
    message: "must not exceed the recruiter target",
    path: ["defaultBrief", "firmTarget"],
  });

export function getRecruiterResearchSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
): RecruiterResearchSettings {
  const value = database
    .select({ value: recruiterResearchSettings.value })
    .from(recruiterResearchSettings)
    .where(eq(recruiterResearchSettings.key, "default"))
    .get()?.value;
  if (value === undefined) {
    throw new Error("Missing recruiter research settings in SQLite. Run pnpm db:setup.");
  }
  const parsed = settingsSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid recruiter research settings: ${issue?.path.join(".") || "value"} ${issue?.message || "is invalid"}.`,
    );
  }
  return parsed.data;
}
