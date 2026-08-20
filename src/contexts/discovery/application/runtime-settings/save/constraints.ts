import type { RuntimeSettingsCommand } from "./command";

interface NumericConstraint {
  readonly integer: boolean;
  readonly max: number;
  readonly min: number;
  readonly step?: number;
}

const integer = (min: number, max: number): NumericConstraint => ({ integer: true, min, max });
const decimal = (min: number, max: number, step: number): NumericConstraint => ({
  integer: false,
  max,
  min,
  step,
});

export const runtimeSettingConstraints = {
  boardJobLimit: integer(1, 2_000),
  customIntegrationPriority: integer(0, 10_000),
  discoveryPollIntervalMs: integer(1_000, 60_000),
  discoveryStaleAfterMs: integer(60_000, 3_600_000),
  freshnessMaxScore: integer(0, 100),
  freshnessMinimumScore: integer(0, 100),
  freshnessStepDays: integer(1, 365),
  fullTokenScore: integer(0, 100),
  exactTitleScore: integer(0, 100),
  locationScore: integer(0, 100),
  maximumAgeDays: integer(1, 365),
  minimumScore: integer(0, 100),
  partialTokenScore: integer(0, 100),
  partialTokenThreshold: decimal(0, 1, 0.05),
  providerMaxResults: integer(1, 100),
  remoteScore: integer(0, 100),
  resultsPerQuery: integer(1, 100),
  runHistoryLimit: integer(1, 1_000),
  searchFreshnessDays: integer(0, 365),
  timeoutMs: integer(1_000, 120_000),
  unknownDateScore: integer(0, 100),
  workYieldBatchSize: integer(1, 1_000),
} as const satisfies Record<string, NumericConstraint>;

export const runtimeTextConstraints = {
  salaryCurrency: {
    maxLength: 3,
    pattern: /^[A-Z]{3}$/,
  },
  userAgent: {
    maxLength: 200,
    minLength: 3,
  },
} as const;

export type RuntimeNumericSetting = keyof typeof runtimeSettingConstraints;

export function findInvalidRuntimeSetting(
  settings: RuntimeSettingsCommand,
): RuntimeNumericSetting | "salaryCurrency" | "userAgent" | null {
  const { discovery, integrationPolicy, matching, network, profileDefaults, ui } = settings;
  const values: ReadonlyArray<readonly [RuntimeNumericSetting, number]> = [
    ["timeoutMs", network.timeoutMs],
    ["resultsPerQuery", discovery.resultsPerQuery],
    ["boardJobLimit", discovery.boardJobLimit],
    ["searchFreshnessDays", discovery.searchFreshnessDays],
    ["workYieldBatchSize", discovery.workYieldBatchSize],
    ["runHistoryLimit", discovery.runHistoryLimit],
    ["discoveryPollIntervalMs", ui.discoveryPollIntervalMs],
    ["discoveryStaleAfterMs", ui.discoveryStaleAfterMs],
    ["exactTitleScore", matching.exactTitleScore],
    ["fullTokenScore", matching.fullTokenScore],
    ["partialTokenScore", matching.partialTokenScore],
    ["partialTokenThreshold", matching.partialTokenThreshold],
    ["locationScore", matching.locationScore],
    ["remoteScore", matching.remoteScore],
    ["unknownDateScore", matching.unknownDateScore],
    ["freshnessMaxScore", matching.freshnessMaxScore],
    ["freshnessMinimumScore", matching.freshnessMinimumScore],
    ["freshnessStepDays", matching.freshnessStepDays],
    ["customIntegrationPriority", integrationPolicy.customPriority],
    ["maximumAgeDays", profileDefaults.maximumAgeDays],
    ["minimumScore", profileDefaults.minimumScore],
  ];

  for (const [field, value] of values) {
    if (!meetsConstraint(value, runtimeSettingConstraints[field])) {
      return field;
    }
  }
  for (const provider of Object.values(settings.searchProviders)) {
    if (!meetsConstraint(provider.maxResults, runtimeSettingConstraints.providerMaxResults)) {
      return "providerMaxResults";
    }
  }
  if (
    network.userAgent.trim().length < runtimeTextConstraints.userAgent.minLength ||
    network.userAgent.length > runtimeTextConstraints.userAgent.maxLength
  ) {
    return "userAgent";
  }
  if (
    profileDefaults.salaryCurrency !== "" &&
    !runtimeTextConstraints.salaryCurrency.pattern.test(profileDefaults.salaryCurrency)
  ) {
    return "salaryCurrency";
  }
  return null;
}

function meetsConstraint(value: number, constraint: NumericConstraint): boolean {
  return (
    Number.isFinite(value) &&
    (!constraint.integer || Number.isInteger(value)) &&
    value >= constraint.min &&
    value <= constraint.max
  );
}
