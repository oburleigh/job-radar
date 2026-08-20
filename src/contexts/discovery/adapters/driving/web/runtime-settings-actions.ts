"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getJobRadarConfig } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { appSettings } from "@/contexts/discovery/adapters/driven/sqlite/schema";

import type { ActionState } from "./action-state";
import { assertLocalRequest } from "./assert-local-request";

const runtimeSettingsSchema = z.object({
  timeoutMs: z.coerce.number().int().min(1000).max(120000),
  userAgent: z.string().trim().min(3).max(200),
  resultsPerQuery: z.coerce.number().int().min(1).max(100),
  boardJobLimit: z.coerce.number().int().min(1).max(2000),
  searchFreshnessDays: z.coerce.number().int().min(0).max(365),
  workYieldBatchSize: z.coerce.number().int().min(1).max(1000),
  runHistoryLimit: z.coerce.number().int().min(1).max(1000),
  titleSearchMode: z.enum(["title", "anywhere"]),
  structuredVerificationSources: z.string().transform(splitLines),
  closedListingMarkers: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  discoveryPollIntervalMs: z.coerce.number().int().min(1000).max(60000),
  discoveryStaleAfterMs: z.coerce.number().int().min(60000).max(3600000),
  exactTitleScore: z.coerce.number().int().min(0).max(100),
  fullTokenScore: z.coerce.number().int().min(0).max(100),
  partialTokenScore: z.coerce.number().int().min(0).max(100),
  partialTokenThreshold: z.coerce.number().min(0).max(1),
  locationScore: z.coerce.number().int().min(0).max(100),
  remoteScore: z.coerce.number().int().min(0).max(100),
  unknownDateScore: z.coerce.number().int().min(0).max(100),
  freshnessMaxScore: z.coerce.number().int().min(0).max(100),
  freshnessMinimumScore: z.coerce.number().int().min(0).max(100),
  freshnessStepDays: z.coerce.number().int().min(1).max(365),
  stopWords: z.string().transform(splitLines),
  genericTitleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  remoteTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  unrestrictedRemotePhrases: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  searchProviders: z.record(
    z.string().min(1),
    z.object({
      endpoint: z.url(),
      maxResults: z.coerce.number().int().min(1).max(100),
      titleSearchMode: z.union([z.literal(""), z.enum(["title", "anywhere"])]),
    }),
  ),
  customIntegrationPriority: z.coerce.number().int().min(0).max(10000),
});

export async function saveRuntimeSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertLocalRequest();
  const current = getJobRadarConfig();
  const searchProviders = Object.fromEntries(
    Object.keys(current.searchProviders).map((name) => [
      name,
      {
        endpoint: formData.get(`provider:${name}:endpoint`),
        maxResults: formData.get(`provider:${name}:maxResults`),
        titleSearchMode: formData.get(`provider:${name}:titleSearchMode`),
      },
    ]),
  );
  const parsed = runtimeSettingsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    searchProviders,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const values = parsed.data;
  const rows = [
    {
      key: "network",
      value: {
        timeoutMs: values.timeoutMs,
        userAgent: values.userAgent,
      },
    },
    {
      key: "discovery",
      value: {
        resultsPerQuery: values.resultsPerQuery,
        boardJobLimit: values.boardJobLimit,
        searchFreshnessDays: values.searchFreshnessDays,
        workYieldBatchSize: values.workYieldBatchSize,
        runHistoryLimit: values.runHistoryLimit,
        titleSearchMode: values.titleSearchMode,
        structuredVerificationSources: values.structuredVerificationSources,
        closedListingMarkers: values.closedListingMarkers,
      },
    },
    {
      key: "matching",
      value: {
        exactTitleScore: values.exactTitleScore,
        fullTokenScore: values.fullTokenScore,
        partialTokenScore: values.partialTokenScore,
        partialTokenThreshold: values.partialTokenThreshold,
        locationScore: values.locationScore,
        remoteScore: values.remoteScore,
        unknownDateScore: values.unknownDateScore,
        freshnessMaxScore: values.freshnessMaxScore,
        freshnessMinimumScore: values.freshnessMinimumScore,
        freshnessStepDays: values.freshnessStepDays,
        stopWords: values.stopWords,
        genericTitleTerms: values.genericTitleTerms,
        remoteTerms: values.remoteTerms,
        unrestrictedRemotePhrases: values.unrestrictedRemotePhrases,
      },
    },
    {
      key: "ui",
      value: {
        discoveryPollIntervalMs: values.discoveryPollIntervalMs,
        discoveryStaleAfterMs: values.discoveryStaleAfterMs,
      },
    },
    {
      key: "searchProviders",
      value: Object.fromEntries(
        Object.entries(current.searchProviders).map(([name, provider]) => {
          const updated = values.searchProviders[name];
          return [
            name,
            updated
              ? {
                  ...provider,
                  endpoint: updated.endpoint,
                  maxResults: updated.maxResults,
                  titleSearchMode: updated.titleSearchMode === "" ? null : updated.titleSearchMode,
                }
              : provider,
          ];
        }),
      ),
    },
    {
      key: "integrationPolicy",
      value: {
        customPriority: values.customIntegrationPriority,
      },
    },
  ] as const;
  const now = new Date();

  db.transaction((transaction) => {
    for (const row of rows) {
      transaction
        .insert(appSettings)
        .values({ ...row, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: row.value, updatedAt: now },
        })
        .run();
    }
  });

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, message: "Runtime settings saved to SQLite." };
}

function splitLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
