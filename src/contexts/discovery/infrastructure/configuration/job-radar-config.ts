import { z } from "zod";
import {
  runtimeSettingConstraints,
  runtimeTextConstraints,
} from "@/contexts/discovery/application/runtime-settings/save/constraints";
import type { RuntimeSettings } from "@/contexts/discovery/application/runtime-settings/settings";
import { ATS_TYPES } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { appSettings, atsIntegrations } from "@/contexts/discovery/infrastructure/sqlite/schema";

import { defaultProviderExecutionSettings } from "./bootstrap-job-radar";

const integer = (constraint: { readonly min: number; readonly max: number }) =>
  z.number().int().min(constraint.min).max(constraint.max);
const number = (constraint: { readonly min: number; readonly max: number }) =>
  z.number().min(constraint.min).max(constraint.max);

const networkSchema = z.object({
  timeoutMs: integer(runtimeSettingConstraints.timeoutMs),
  userAgent: z
    .string()
    .trim()
    .min(runtimeTextConstraints.userAgent.minLength)
    .max(runtimeTextConstraints.userAgent.maxLength),
});

const discoverySchema = z.object({
  resultsPerQuery: integer(runtimeSettingConstraints.resultsPerQuery),
  boardJobLimit: integer(runtimeSettingConstraints.boardJobLimit),
  searchFreshnessDays: integer(runtimeSettingConstraints.searchFreshnessDays),
  workYieldBatchSize: integer(runtimeSettingConstraints.workYieldBatchSize),
  runHistoryLimit: integer(runtimeSettingConstraints.runHistoryLimit),
  titleSearchMode: z.enum(["title", "anywhere"]),
  providerExecution: z
    .object({
      concurrency: integer(runtimeSettingConstraints.providerConcurrency),
      requestsPerInterval: integer(runtimeSettingConstraints.providerRequestsPerInterval),
      intervalMs: integer(runtimeSettingConstraints.providerIntervalMs),
      maxAttempts: integer(runtimeSettingConstraints.providerMaxAttempts),
      retryMinDelayMs: integer(runtimeSettingConstraints.providerRetryMinDelayMs),
      retryMaxDelayMs: integer(runtimeSettingConstraints.providerRetryMaxDelayMs),
      retryMaxTimeMs: integer(runtimeSettingConstraints.providerRetryMaxTimeMs),
    })
    .refine((policy) => policy.retryMaxDelayMs >= policy.retryMinDelayMs, {
      message: "Maximum retry delay must be at least the first retry delay",
      path: ["retryMaxDelayMs"],
    })
    .default(defaultProviderExecutionSettings),
  structuredVerificationSources: z.array(z.string().min(1)),
  closedListingMarkers: z.array(z.string().min(1)),
});

const uiSchema = z.object({
  discoveryPollIntervalMs: integer(runtimeSettingConstraints.discoveryPollIntervalMs),
  discoveryStaleAfterMs: integer(runtimeSettingConstraints.discoveryStaleAfterMs),
});

const matchingSchema = z.object({
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
  stopWords: z.array(z.string().min(1)),
  genericTitleTerms: z.array(z.string().min(1)),
  remoteTerms: z.array(z.string().min(1)),
  unrestrictedRemotePhrases: z.array(z.string().min(1)),
});

const providerSchema = z.object({
  label: z.string().min(1),
  endpoint: z.url(),
  maxResults: integer(runtimeSettingConstraints.providerMaxResults),
  parameters: z.record(z.string(), z.string()),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  enabled: z.boolean(),
  priority: z.number().int().nonnegative(),
  titleSearchMode: z.enum(["title", "anywhere"]).nullable(),
});

const searchProvidersSchema = z
  .record(z.string().min(1), providerSchema)
  .refine((providers) => Object.keys(providers).length > 0, {
    message: "At least one search provider must be configured",
  });

const integrationSchema = z.object({
  label: z.string().min(1),
  hostnames: z.array(z.string().min(1)),
  hostSuffixes: z.array(z.string().min(1)),
  supportsBoardSync: z.boolean(),
  priority: z.number().int().nonnegative(),
  pageSize: z.number().int().positive().nullable(),
  endpoints: z.record(z.string(), z.url()),
});

const integrationPolicySchema = z.object({
  customPriority: integer(runtimeSettingConstraints.customIntegrationPriority),
});

const profileDefaultsSchema = z.object({
  maximumAgeDays: integer(runtimeSettingConstraints.maximumAgeDays),
  minimumScore: integer(runtimeSettingConstraints.minimumScore),
  salaryCurrency: z
    .string()
    .refine((value) => value === "" || runtimeTextConstraints.salaryCurrency.pattern.test(value)),
});

export interface JobRadarConfig extends RuntimeSettings {
  ats: Record<string, z.infer<typeof integrationSchema>>;
}

export function parseDiscoverySettings(value: unknown): RuntimeSettings["discovery"] {
  return discoverySchema.parse(value);
}

export function getJobRadarConfig(): JobRadarConfig {
  const settings = new Map(
    db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .all()
      .map((row) => [row.key, row.value]),
  );
  const integrationRows = db.select().from(atsIntegrations).all();
  const ats = Object.fromEntries(
    integrationRows.map((row) => [
      row.atsType,
      integrationSchema.parse({
        label: row.label,
        hostnames: row.hostnames,
        hostSuffixes: row.hostSuffixes,
        supportsBoardSync: row.supportsBoardSync,
        priority: row.priority,
        pageSize: row.pageSize,
        endpoints: row.endpoints,
      }),
    ]),
  );

  for (const atsType of ATS_TYPES) {
    if (!(atsType in ats)) {
      throw new Error(`Missing ${atsType} integration configuration in SQLite`);
    }
  }

  return {
    network: networkSchema.parse(requireSetting(settings, "network")),
    discovery: parseDiscoverySettings(requireSetting(settings, "discovery")),
    ui: uiSchema.parse(requireSetting(settings, "ui")),
    matching: matchingSchema.parse(requireSetting(settings, "matching")),
    searchProviders: searchProvidersSchema.parse(requireSetting(settings, "searchProviders")),
    integrationPolicy: integrationPolicySchema.parse(requireSetting(settings, "integrationPolicy")),
    profileDefaults: profileDefaultsSchema.parse(requireSetting(settings, "profileDefaults")),
    ats,
  };
}

export function endpoint(
  atsType: string,
  name: string,
  values: Record<string, string | number>,
): string {
  const template = getAtsIntegration(atsType).endpoints[name];
  if (!template) {
    throw new Error(`Missing ${atsType}.${name} endpoint in SQLite config`);
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing ${key} value for ${atsType}.${name} endpoint`);
    }
    return encodeURIComponent(String(value));
  });
}

export function hostMatches(atsType: string, hostname: string): boolean {
  const config = getAtsIntegration(atsType);
  return (
    config.hostnames.includes(hostname) ||
    config.hostSuffixes.some((suffix) => hostname.endsWith(suffix))
  );
}

export function supportsBoardSync(atsType: string): boolean {
  return getAtsIntegration(atsType).supportsBoardSync;
}

export function getAtsIntegration(atsType: string): z.infer<typeof integrationSchema> {
  const integration = getJobRadarConfig().ats[atsType];
  if (!integration) {
    throw new Error(`Missing ${atsType} integration configuration in SQLite`);
  }
  return integration;
}

function requireSetting(settings: Map<string, unknown>, key: string): unknown {
  if (!settings.has(key)) {
    throw new Error(`Missing ${key} setting in SQLite`);
  }
  return settings.get(key);
}
