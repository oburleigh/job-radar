import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import type { ExecutionSettingsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-execution-settings";
import type { PublicSearchSettingsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-public-search-settings";
import type { ResearchCriteriaOptionsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-research-criteria-options";
import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import { recruiterResearchSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

const positiveInteger = z.number().int().safe().positive();
const briefItems = z.array(z.string().trim().min(1));
const settingsSchema = z
  .object({
    criteriaOptions: z
      .object({
        industries: briefItems.min(1),
        specialisms: briefItems.min(1),
      })
      .strict(),
    execution: z
      .object({
        model: z.string().trim().min(1),
        reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
        stageRequestLimit: positiveInteger,
        stageTimeoutMs: z.number().int().safe().min(1_000),
      })
      .strict(),
    directoryMatchWeights: z
      .object({
        currentMandatesOrActivity: z.number().nonnegative(),
        evidenceFreshnessAndQuality: z.number().nonnegative(),
        namedRecruiterOrTeamEvidence: z.number().nonnegative(),
        recruiterRoleAndSeniority: z.number().nonnegative(),
        scaleOrTrackRecord: z.number().nonnegative(),
        specialism: z.number().nonnegative(),
        targetMarketOperatingDepth: z.number().nonnegative(),
      })
      .strict(),
    defaultBrief: z
      .object({
        criteria: z.object({ industries: briefItems, specialisms: briefItems }).strict(),
        description: z.string().trim().max(1_000),
        firmTarget: positiveInteger,
        recruiterTarget: positiveInteger,
      })
      .strict(),
    publicSearch: z
      .object({
        currentActivityTerms: briefItems.min(1),
        excludedHosts: briefItems,
        firmDiscoveryPhrases: briefItems.min(1),
        maxPagesPerQuery: positiveInteger,
        namedRecruiterOrTeamTerms: briefItems.min(1),
        profileSourceHosts: briefItems.min(1),
        providerName: z.string().trim().min(1),
        recruiterRoleTerms: briefItems.min(1),
        resultsPerQuery: positiveInteger,
        scaleOrTrackRecordTerms: briefItems.min(1),
        stageRequestLimit: positiveInteger,
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

export function replacePublicSearchSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  publicSearch: PublicSearchSettingsCommand,
  changedAt: Date,
): void {
  const settings = getRecruiterResearchSettings(database);
  database
    .update(recruiterResearchSettings)
    .set({
      value: { ...settings, publicSearch },
      updatedAt: changedAt,
    })
    .where(eq(recruiterResearchSettings.key, "default"))
    .run();
}

export function replaceResearchCriteriaOptions<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  criteriaOptions: ResearchCriteriaOptionsCommand,
  changedAt: Date,
): void {
  const settings = getRecruiterResearchSettings(database);
  database
    .update(recruiterResearchSettings)
    .set({ value: { ...settings, criteriaOptions }, updatedAt: changedAt })
    .where(eq(recruiterResearchSettings.key, "default"))
    .run();
}

export function replaceDirectoryMatchWeights<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  weights: DirectoryMatchWeights,
  changedAt: Date,
): void {
  const settings = getRecruiterResearchSettings(database);
  database
    .update(recruiterResearchSettings)
    .set({ value: { ...settings, directoryMatchWeights: weights }, updatedAt: changedAt })
    .where(eq(recruiterResearchSettings.key, "default"))
    .run();
}

export function replaceExecutionSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  execution: ExecutionSettingsCommand,
  changedAt: Date,
): void {
  const settings = getRecruiterResearchSettings(database);
  database
    .update(recruiterResearchSettings)
    .set({ value: { ...settings, execution }, updatedAt: changedAt })
    .where(eq(recruiterResearchSettings.key, "default"))
    .run();
}
