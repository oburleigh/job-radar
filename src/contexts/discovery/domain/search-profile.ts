import type { Currency } from "./currency";

declare const searchProfileDefinitionBrand: unique symbol;

export type SalaryPreference = {
  readonly currency: Currency | null;
  readonly minimumAnnual: number | null;
  readonly maximumAnnual: number | null;
};

export type SearchProfileDraft = {
  readonly name: string;
  readonly targetTitles: ReadonlyArray<string>;
  readonly targetLocations: ReadonlyArray<string>;
  readonly requiredJobTerms: ReadonlyArray<string>;
  readonly excludedTitleTerms: ReadonlyArray<string>;
  readonly excludedLocationTerms: ReadonlyArray<string>;
  readonly excludedDescriptionTerms: ReadonlyArray<string>;
  readonly includeRemote: boolean;
  readonly includeUnverified: boolean;
  readonly salaryPreference: SalaryPreference;
  readonly maximumAgeDays: number;
  readonly minimumScore: number;
};

export type SearchProfileDefinition = SearchProfileDraft & {
  readonly [searchProfileDefinitionBrand]: "SearchProfileDefinition";
};

export type SearchProfileDefinitionResult =
  | { readonly status: "valid"; readonly profile: SearchProfileDefinition }
  | {
      readonly status: "invalid";
      readonly reason:
        | "invalid-name"
        | "missing-target-title"
        | "missing-target-location"
        | "salary-currency-required"
        | "invalid-salary-range"
        | "invalid-maximum-age"
        | "invalid-minimum-score";
    };

export function createSearchProfileDefinition(
  draft: SearchProfileDraft,
): SearchProfileDefinitionResult {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 120) {
    return { status: "invalid", reason: "invalid-name" };
  }
  const targetTitles = normalizedTerms(draft.targetTitles);
  if (targetTitles.length === 0) {
    return { status: "invalid", reason: "missing-target-title" };
  }
  const targetLocations = normalizedTerms(draft.targetLocations);
  if (targetLocations.length === 0) {
    return { status: "invalid", reason: "missing-target-location" };
  }
  if (!validIntegerInRange(draft.maximumAgeDays, 1, 365)) {
    return { status: "invalid", reason: "invalid-maximum-age" };
  }
  if (!validIntegerInRange(draft.minimumScore, 0, 100)) {
    return { status: "invalid", reason: "invalid-minimum-score" };
  }

  const { currency, minimumAnnual, maximumAnnual } = draft.salaryPreference;
  if ((minimumAnnual !== null || maximumAnnual !== null) && currency === null) {
    return { status: "invalid", reason: "salary-currency-required" };
  }
  if (
    !validOptionalSalary(minimumAnnual) ||
    !validOptionalSalary(maximumAnnual) ||
    (minimumAnnual !== null && maximumAnnual !== null && minimumAnnual > maximumAnnual)
  ) {
    return { status: "invalid", reason: "invalid-salary-range" };
  }

  const profile = {
    name,
    targetTitles,
    targetLocations,
    requiredJobTerms: normalizedTerms(draft.requiredJobTerms),
    excludedTitleTerms: normalizedTerms(draft.excludedTitleTerms),
    excludedLocationTerms: normalizedTerms(draft.excludedLocationTerms),
    excludedDescriptionTerms: normalizedTerms(draft.excludedDescriptionTerms),
    includeRemote: draft.includeRemote,
    includeUnverified: draft.includeUnverified,
    salaryPreference: Object.freeze({ currency, minimumAnnual, maximumAnnual }),
    maximumAgeDays: draft.maximumAgeDays,
    minimumScore: draft.minimumScore,
  } as SearchProfileDefinition;
  return { status: "valid", profile: Object.freeze(profile) };
}

function normalizedTerms(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}

function validOptionalSalary(value: number | null): boolean {
  return value === null || validIntegerInRange(value, 1_000, 100_000_000);
}

function validIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
