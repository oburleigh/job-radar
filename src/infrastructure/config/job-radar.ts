import { z } from "zod";
import { ATS_TYPES } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import type { MatchingPolicy } from "@/contexts/discovery/hexagon/domain/job-match";
import { db } from "@/infrastructure/database/client";
import { appSettings, atsIntegrations } from "@/infrastructure/database/schema";

const networkSchema = z.object({
  timeoutMs: z.number().int().positive(),
  userAgent: z.string().min(1),
});

const discoverySchema = z.object({
  resultsPerQuery: z.number().int().positive(),
  boardJobLimit: z.number().int().positive(),
  searchFreshnessDays: z.number().int().nonnegative(),
  workYieldBatchSize: z.number().int().positive(),
  runHistoryLimit: z.number().int().positive(),
  titleSearchMode: z.enum(["title", "anywhere"]),
  structuredVerificationSources: z.array(z.string().min(1)),
  closedListingMarkers: z.array(z.string().min(1)),
});

const uiSchema = z.object({
  discoveryPollIntervalMs: z.number().int().min(1000).max(60000),
  discoveryStaleAfterMs: z.number().int().min(60000).max(3600000),
});

const matchingSchema = z.object({
  exactTitleScore: z.number().int().nonnegative(),
  fullTokenScore: z.number().int().nonnegative(),
  partialTokenScore: z.number().int().nonnegative(),
  partialTokenThreshold: z.number().min(0).max(1),
  locationScore: z.number().int().nonnegative(),
  remoteScore: z.number().int().nonnegative(),
  unknownDateScore: z.number().int().nonnegative(),
  freshnessMaxScore: z.number().int().nonnegative(),
  freshnessMinimumScore: z.number().int().nonnegative(),
  freshnessStepDays: z.number().int().positive(),
  stopWords: z.array(z.string().min(1)),
  genericTitleTerms: z.array(z.string().min(1)),
  remoteTerms: z.array(z.string().min(1)),
  unrestrictedRemotePhrases: z.array(z.string().min(1)),
});

const providerSchema = z.object({
  label: z.string().min(1),
  endpoint: z.url(),
  maxResults: z.number().int().positive(),
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
  customPriority: z.number().int().min(0).max(10000),
});

export interface JobRadarConfig {
  network: z.infer<typeof networkSchema>;
  discovery: z.infer<typeof discoverySchema>;
  ui: z.infer<typeof uiSchema>;
  matching: MatchingPolicy;
  searchProviders: z.infer<typeof searchProvidersSchema>;
  integrationPolicy: z.infer<typeof integrationPolicySchema>;
  ats: Record<string, z.infer<typeof integrationSchema>>;
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
    discovery: discoverySchema.parse(requireSetting(settings, "discovery")),
    ui: uiSchema.parse(requireSetting(settings, "ui")),
    matching: matchingSchema.parse(requireSetting(settings, "matching")),
    searchProviders: searchProvidersSchema.parse(requireSetting(settings, "searchProviders")),
    integrationPolicy: integrationPolicySchema.parse(requireSetting(settings, "integrationPolicy")),
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
