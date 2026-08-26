import { z } from "zod";
import { SEARCH_STRATEGIES } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type { RuntimeSettingsCommand } from "@/contexts/discovery/application/runtime-settings/save/command";
import {
  runtimeSettingConstraints,
  runtimeTextConstraints,
} from "@/contexts/discovery/application/runtime-settings/save/constraints";
import { isIso4217Currency } from "@/contexts/discovery/presentation/web/components/country-currency-catalogue";

const integer = (constraint: { readonly min: number; readonly max: number }) =>
  z.coerce.number().int().min(constraint.min).max(constraint.max);
const number = (constraint: { readonly min: number; readonly max: number }) =>
  z.coerce.number().min(constraint.min).max(constraint.max);
const strategyListSchema = z
  .string()
  .transform(splitLines)
  .pipe(z.array(z.enum(SEARCH_STRATEGIES)).min(1));
const marketKeySchema = z
  .string()
  .regex(
    /^(?:country:[A-Z]{2}|subdivision:[A-Z]{2}-[A-Z0-9]{1,3}|city:[A-Z]{2}:[a-z0-9][a-z0-9-]*)$/,
  );
const marketLocationsSchema = z
  .string()
  .transform((value, context) => parseJson(value, context, "Provider market locations"))
  .pipe(z.record(marketKeySchema, z.string().trim().min(1)));

const marketVocabularyRequestSchema = z.object({
  markets: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().trim().min(1).optional(),
      aliases: z.array(z.string().trim().min(1)),
      covers: z.array(z.string().min(1)).optional(),
      searchLanguage: z.string().min(1).optional(),
    }),
  ),
});

const runtimeSettingsSchema = z
  .object({
    timeoutMs: integer(runtimeSettingConstraints.timeoutMs),
    userAgent: z
      .string()
      .trim()
      .min(runtimeTextConstraints.userAgent.minLength)
      .max(runtimeTextConstraints.userAgent.maxLength),
    resultsPerQuery: integer(runtimeSettingConstraints.resultsPerQuery),
    boardJobLimit: integer(runtimeSettingConstraints.boardJobLimit),
    searchFreshnessDays: integer(runtimeSettingConstraints.searchFreshnessDays),
    workYieldBatchSize: integer(runtimeSettingConstraints.workYieldBatchSize),
    runHistoryLimit: integer(runtimeSettingConstraints.runHistoryLimit),
    providerConcurrency: integer(runtimeSettingConstraints.providerConcurrency),
    providerRequestsPerInterval: integer(runtimeSettingConstraints.providerRequestsPerInterval),
    providerIntervalMs: integer(runtimeSettingConstraints.providerIntervalMs),
    providerMaxAttempts: integer(runtimeSettingConstraints.providerMaxAttempts),
    providerRetryMinDelayMs: integer(runtimeSettingConstraints.providerRetryMinDelayMs),
    providerRetryMaxDelayMs: integer(runtimeSettingConstraints.providerRetryMaxDelayMs),
    providerRetryMaxTimeMs: integer(runtimeSettingConstraints.providerRetryMaxTimeMs),
    strategies: strategyListSchema,
    minimumUsefulHitsPerPage: integer(runtimeSettingConstraints.minimumUsefulHitsPerPage),
    maxPagesPerLane: integer(runtimeSettingConstraints.maxPagesPerLane),
    maxRequestsPerRun: integer(runtimeSettingConstraints.maxRequestsPerRun),
    structuredVerificationSources: z.string().transform(splitLines),
    closedListingMarkers: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    discoveryPollIntervalMs: integer(runtimeSettingConstraints.discoveryPollIntervalMs),
    discoveryStaleAfterMs: integer(runtimeSettingConstraints.discoveryStaleAfterMs),
    exactTitleScore: integer(runtimeSettingConstraints.exactTitleScore),
    fullTokenScore: integer(runtimeSettingConstraints.fullTokenScore),
    partialTokenScore: integer(runtimeSettingConstraints.partialTokenScore),
    partialTokenThreshold: number(runtimeSettingConstraints.partialTokenThreshold),
    locationScore: integer(runtimeSettingConstraints.locationScore),
    remoteScore: integer(runtimeSettingConstraints.remoteScore),
    unknownDateScore: integer(runtimeSettingConstraints.unknownDateScore),
    freshnessMaxScore: integer(runtimeSettingConstraints.freshnessMaxScore),
    freshnessMinimumScore: integer(runtimeSettingConstraints.freshnessMinimumScore),
    freshnessStepDays: integer(runtimeSettingConstraints.freshnessStepDays),
    stopWords: z.string().transform(splitLines),
    genericTitleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    remoteTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    unrestrictedRemotePhrases: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    marketVocabulary: z
      .string()
      .transform((value, context) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          context.addIssue({ code: "custom", message: "Market vocabulary must be valid JSON." });
          return z.NEVER;
        }
      })
      .pipe(marketVocabularyRequestSchema),
    searchProviders: z.record(
      z.string().min(1),
      z.object({
        endpoint: z.url(),
        maxResults: integer(runtimeSettingConstraints.providerMaxResults),
        strategies: z
          .string()
          .transform((value) => (value.trim() === "" ? null : splitLines(value)))
          .pipe(z.array(z.enum(SEARCH_STRATEGIES)).min(1).nullable()),
        marketLocations: marketLocationsSchema,
      }),
    ),
    customIntegrationPriority: integer(runtimeSettingConstraints.customIntegrationPriority),
    maximumAgeDays: integer(runtimeSettingConstraints.maximumAgeDays),
    minimumScore: integer(runtimeSettingConstraints.minimumScore),
    salaryCurrency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine(
        (value) =>
          value === "" ||
          (runtimeTextConstraints.salaryCurrency.pattern.test(value) && isIso4217Currency(value)),
        { message: "Default salary currency must be a valid ISO 4217 code such as GBP." },
      ),
  })
  .superRefine((settings, context) => {
    if (settings.providerRetryMaxDelayMs < settings.providerRetryMinDelayMs) {
      context.addIssue({
        code: "custom",
        path: ["providerRetryMaxDelayMs"],
        message: "Maximum retry delay must be at least the first retry delay.",
      });
    }
  });

export type RuntimeSettingsRequestResult =
  | { readonly ok: true; readonly command: RuntimeSettingsCommand }
  | { readonly ok: false; readonly field: string; readonly message: string };

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
        strategies: formData.get(`provider:${name}:strategies`),
        marketLocations: formData.get(`provider:${name}:marketLocations`),
      },
    ]),
  );
  const parsed = runtimeSettingsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    searchProviders,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: issue ? requestFieldName(issue.path) : "runtimeSettings",
      message: issue?.message ?? "Invalid settings.",
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
        providerExecution: {
          concurrency: values.providerConcurrency,
          requestsPerInterval: values.providerRequestsPerInterval,
          intervalMs: values.providerIntervalMs,
          maxAttempts: values.providerMaxAttempts,
          retryMinDelayMs: values.providerRetryMinDelayMs,
          retryMaxDelayMs: values.providerRetryMaxDelayMs,
          retryMaxTimeMs: values.providerRetryMaxTimeMs,
        },
        strategies: values.strategies,
        minimumUsefulHitsPerPage: values.minimumUsefulHitsPerPage,
        maxPagesPerLane: values.maxPagesPerLane,
        maxRequestsPerRun: values.maxRequestsPerRun,
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
      marketVocabulary: values.marketVocabulary,
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
                  strategies: updated.strategies,
                  marketLocations: updated.marketLocations,
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

function requestFieldName(path: PropertyKey[]): string {
  if (path[0] === "searchProviders" && typeof path[1] === "string" && typeof path[2] === "string") {
    return `provider:${path[1]}:${path[2]}`;
  }
  return typeof path[0] === "string" ? path[0] : "runtimeSettings";
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

function parseJson(value: string, context: z.RefinementCtx, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    context.addIssue({ code: "custom", message: `${label} must be valid JSON.` });
    return z.NEVER;
  }
}
