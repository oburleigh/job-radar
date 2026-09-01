import { iso31661, iso31662 } from "iso-3166";
import { z } from "zod";
import { SEARCH_STRATEGIES } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import {
  runtimeSettingConstraints,
  runtimeTextConstraints,
} from "@/contexts/discovery/application/runtime-settings/save/constraints";
import type {
  MarketVocabulary,
  RuntimeSettings,
} from "@/contexts/discovery/application/runtime-settings/settings";
import { ATS_TYPES } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { appSettings, atsIntegrations } from "@/contexts/discovery/infrastructure/sqlite/schema";

import {
  defaultAdaptivePaginationSettings,
  defaultProviderExecutionSettings,
  defaultUiSettings,
} from "./bootstrap-job-radar";

type Database = typeof db;

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

const strategySchema = z.enum(SEARCH_STRATEGIES);
const strategyListSchema = z
  .array(strategySchema)
  .min(1)
  .refine((strategies) => new Set(strategies).size === strategies.length, {
    message: "Search strategies must be unique",
  });
const legacyTitleSearchModeSchema = z.enum(["title", "anywhere"]);

const discoverySchema = z
  .object({
    resultsPerQuery: integer(runtimeSettingConstraints.resultsPerQuery),
    boardJobLimit: integer(runtimeSettingConstraints.boardJobLimit),
    searchFreshnessDays: integer(runtimeSettingConstraints.searchFreshnessDays),
    workYieldBatchSize: integer(runtimeSettingConstraints.workYieldBatchSize),
    runHistoryLimit: integer(runtimeSettingConstraints.runHistoryLimit),
    strategies: strategyListSchema.optional(),
    titleSearchMode: legacyTitleSearchModeSchema.optional(),
    minimumUsefulHitsPerPage: integer(runtimeSettingConstraints.minimumUsefulHitsPerPage).default(
      defaultAdaptivePaginationSettings.minimumUsefulHitsPerPage,
    ),
    maxPagesPerLane: integer(runtimeSettingConstraints.maxPagesPerLane).default(
      defaultAdaptivePaginationSettings.maxPagesPerLane,
    ),
    maxRequestsPerRun: integer(runtimeSettingConstraints.maxRequestsPerRun).default(
      defaultAdaptivePaginationSettings.maxRequestsPerRun,
    ),
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
  })
  .transform(({ titleSearchMode, strategies, ...settings }) => ({
    ...settings,
    strategies: strategies ?? legacyStrategies(titleSearchMode ?? "title"),
  }));

const uiSchema = z.object({
  discoveryNotificationDurationMs: integer(
    runtimeSettingConstraints.discoveryNotificationDurationMs,
  ).default(defaultUiSettings.discoveryNotificationDurationMs),
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

const providerOwnedParameterKeys = new Set([
  "country",
  "search_lang",
  "ui_lang",
  "offset",
  "location",
  "gl",
  "hl",
  "start",
  "page",
]);
const marketKeySchema = z
  .string()
  .regex(
    /^(?:country:[A-Z]{2}|subdivision:[A-Z]{2}-[A-Z0-9]{1,3}|city:[A-Z]{2}:[a-z0-9][a-z0-9-]*)$/,
  );

const providerSchema = z
  .object({
    label: z.string().min(1),
    endpoint: z.url(),
    maxResults: integer(runtimeSettingConstraints.providerMaxResults),
    parameters: z
      .record(z.string(), z.string())
      .refine(
        (parameters) =>
          Object.keys(parameters).every((key) => !providerOwnedParameterKeys.has(key)),
        {
          message: "Provider geography and pagination parameters are owned by the adapter",
        },
      ),
    apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    enabled: z.boolean(),
    priority: z.number().int().nonnegative(),
    strategies: strategyListSchema.nullable().optional(),
    titleSearchMode: legacyTitleSearchModeSchema.nullable().optional(),
    marketLocations: z.record(marketKeySchema, z.string().trim().min(1)).default({}),
  })
  .transform(({ titleSearchMode, strategies, ...provider }) => ({
    ...provider,
    strategies:
      strategies !== undefined
        ? strategies
        : titleSearchMode === null || titleSearchMode === undefined
          ? null
          : legacyStrategies(titleSearchMode),
  }));

const marketEntrySchema = z.object({
  key: marketKeySchema,
  label: z.string().trim().min(1).optional(),
  aliases: z.array(z.string().trim().min(1)),
  covers: z.array(marketKeySchema).optional(),
  searchLanguage: z
    .string()
    .refine(isLanguageTag, { message: "Search language must be a valid language tag" })
    .optional(),
});
const marketVocabularySchema = z
  .object({ markets: z.array(marketEntrySchema).min(1) })
  .superRefine((vocabulary, context) => {
    const entries = new Map(vocabulary.markets.map((market) => [market.key, market]));
    const terms = new Map<string, string>();

    for (const [index, market] of vocabulary.markets.entries()) {
      const countryCode = marketCountryCode(market.key);
      const isCountry = market.key.startsWith("country:");
      const isSubdivision = market.key.startsWith("subdivision:");
      const country = iso31661.find((entry) => entry.alpha2 === countryCode);
      const subdivision = isSubdivision
        ? iso31662.find((entry) => entry.code === market.key.slice("subdivision:".length))
        : undefined;

      if (!country || (isSubdivision && !subdivision)) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "key"],
          message: `Unknown ISO market key ${market.key}`,
        });
      }
      if (!isCountry && !market.label) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "label"],
          message: "Subdivision and city markets require an operator label",
        });
      }
      if (!isCountry && market.covers !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "covers"],
          message: "Only country markets can cover other markets",
        });
      }
      if (!isCountry && market.searchLanguage !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["markets", index, "searchLanguage"],
          message: "Subdivision and city markets inherit their search language",
        });
      }

      for (const coveredKey of market.covers ?? []) {
        if (!entries.has(coveredKey)) {
          context.addIssue({
            code: "custom",
            path: ["markets", index, "covers"],
            message: `Covered market ${coveredKey} is not configured`,
          });
        } else if (marketCountryCode(coveredKey) !== countryCode) {
          context.addIssue({
            code: "custom",
            path: ["markets", index, "covers"],
            message: `Covered market ${coveredKey} belongs to another country`,
          });
        }
      }

      const label = isCountry ? country?.name : market.label;
      for (const term of [...(label ? [label] : []), ...market.aliases]) {
        const normalized = normalizeMarketTerm(term);
        const owner = terms.get(normalized);
        if (owner !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["markets", index, "aliases"],
            message: `Market term ${term.trim()} duplicates ${owner}`,
          });
        } else {
          terms.set(normalized, market.key);
        }
      }
    }
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
  marketVocabulary: MarketVocabulary;
  ats: Record<string, z.infer<typeof integrationSchema>>;
}

export function parseDiscoverySettings(value: unknown): RuntimeSettings["discovery"] {
  return discoverySchema.parse(value);
}

export function parseMarketVocabulary(value: unknown): MarketVocabulary {
  return marketVocabularySchema.parse(value);
}

export function parseSearchProviders(value: unknown): JobRadarConfig["searchProviders"] {
  return searchProvidersSchema.parse(value);
}

export function isMarketVocabulary(value: MarketVocabulary): boolean {
  return marketVocabularySchema.safeParse(value).success;
}

export function getJobRadarConfig(database: Database = db): JobRadarConfig {
  const settings = new Map(
    database
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .all()
      .map((row) => [row.key, row.value]),
  );
  const integrationRows = database.select().from(atsIntegrations).all();
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
    marketVocabulary: parseMarketVocabulary(requireSetting(settings, "marketVocabulary")),
    searchProviders: parseSearchProviders(requireSetting(settings, "searchProviders")),
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
  const rendered = optionalEndpoint(atsType, name, values);
  if (!rendered) {
    throw new Error(`Missing ${atsType}.${name} endpoint in SQLite config`);
  }

  return rendered;
}

export function optionalEndpoint(
  atsType: string,
  name: string,
  values: Record<string, string | number>,
): string | null {
  const template = getAtsIntegration(atsType).endpoints[name];
  if (!template) {
    return null;
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

export function supportsBoardSync(atsType: string, database: Database = db): boolean {
  return getAtsIntegration(atsType, database).supportsBoardSync;
}

export function getAtsIntegration(
  atsType: string,
  database: Database = db,
): z.infer<typeof integrationSchema> {
  const integration = getJobRadarConfig(database).ats[atsType];
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

function isLanguageTag(value: string): boolean {
  try {
    new Intl.Locale(value);
    return true;
  } catch {
    return false;
  }
}

function marketCountryCode(key: string): string {
  const separator = key.indexOf(":");
  return key.slice(separator + 1, separator + 3);
}

function normalizeMarketTerm(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function legacyStrategies(mode: "title" | "anywhere") {
  return mode === "anywhere"
    ? (["relaxed-title"] as const)
    : (["role-first", "location-first", "phrase"] as const);
}
