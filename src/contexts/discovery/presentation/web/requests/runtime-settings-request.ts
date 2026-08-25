import { z } from "zod";
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
    titleSearchMode: z.enum(["title", "anywhere"]),
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
    searchProviders: z.record(
      z.string().min(1),
      z.object({
        endpoint: z.url(),
        maxResults: integer(runtimeSettingConstraints.providerMaxResults),
        titleSearchMode: z.union([z.literal(""), z.enum(["title", "anywhere"])]),
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
        titleSearchMode: formData.get(`provider:${name}:titleSearchMode`),
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
