import { z } from "zod";

import type { RuntimeSettingsCommand } from "../../../application/runtime-settings/save/command";

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
  maximumAgeDays: z.coerce.number().int().min(1).max(365),
  minimumScore: z.coerce.number().int().min(0).max(100),
  salaryCurrency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z]{3}$/.test(value), {
      message: "Default salary currency must be a three-letter code such as GBP.",
    }),
});

export type RuntimeSettingsRequestResult =
  | { readonly ok: true; readonly command: RuntimeSettingsCommand }
  | { readonly ok: false; readonly message: string };

export function parseRuntimeSettingsRequest(
  formData: FormData,
  current: RuntimeSettingsCommand,
): RuntimeSettingsRequestResult {
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
  return {
    ok: true,
    command: {
      network: {
        timeoutMs: values.timeoutMs,
        userAgent: values.userAgent,
      },
      discovery: {
        resultsPerQuery: values.resultsPerQuery,
        boardJobLimit: values.boardJobLimit,
        searchFreshnessDays: values.searchFreshnessDays,
        workYieldBatchSize: values.workYieldBatchSize,
        runHistoryLimit: values.runHistoryLimit,
        titleSearchMode: values.titleSearchMode,
        structuredVerificationSources: values.structuredVerificationSources,
        closedListingMarkers: values.closedListingMarkers,
      },
      matching: {
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
      ui: {
        discoveryPollIntervalMs: values.discoveryPollIntervalMs,
        discoveryStaleAfterMs: values.discoveryStaleAfterMs,
      },
      searchProviders: Object.fromEntries(
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
      integrationPolicy: {
        customPriority: values.customIntegrationPriority,
      },
      profileDefaults: {
        maximumAgeDays: values.maximumAgeDays,
        minimumScore: values.minimumScore,
        salaryCurrency: values.salaryCurrency,
      },
    },
  };
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
