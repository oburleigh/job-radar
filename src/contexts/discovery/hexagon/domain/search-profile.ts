export type SalaryPreference = {
  readonly currency: string;
  readonly minimumAnnual: number | null;
  readonly maximumAnnual: number | null;
};

export type SearchProfileDefinition = {
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
