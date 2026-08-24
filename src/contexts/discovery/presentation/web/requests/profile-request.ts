import { z } from "zod";

import type { SaveSearchProfileCommand } from "@/contexts/discovery/application/search-profiles/save/command";
import { currencyFrom } from "@/contexts/discovery/domain/currency";
import { searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import {
  createSearchProfileDefinition,
  type SearchProfileDefinitionResult,
} from "@/contexts/discovery/domain/search-profile";
import { isIso4217Currency } from "@/contexts/discovery/presentation/web/components/country-currency-catalogue";

export type ProfileRequestResult =
  | { readonly ok: true; readonly command: SaveSearchProfileCommand }
  | { readonly ok: false; readonly message: string };

const optionalSalaryAmount = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().positive().max(100_000_000).nullable(),
);

const profileSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(2).max(120),
    titleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    locationTerms: z.string().transform(splitLines),
    requiredJobTerms: z.string().transform(splitLines),
    excludedTitleTerms: z.string().transform(splitLines),
    excludedLocationTerms: z.string().transform(splitLines),
    excludedDescriptionTerms: z.string().transform(splitLines),
    includeRemote: z.boolean(),
    includeUnverified: z.boolean(),
    salaryCurrency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .transform((value, context) => {
        if (value === "") {
          return null;
        }
        const currency = currencyFrom(value);
        if (currency === null || !isIso4217Currency(value)) {
          context.addIssue({
            code: "custom",
            message: "Salary currency must be a valid ISO 4217 code such as GBP.",
          });
          return z.NEVER;
        }
        return currency;
      }),
    salaryMin: optionalSalaryAmount,
    salaryMax: optionalSalaryAmount,
    maxAgeDays: z.coerce.number().int().min(1).max(365),
    minScore: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((profile, context) => {
    if (
      (profile.salaryMin !== null || profile.salaryMax !== null) &&
      profile.salaryCurrency === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["salaryCurrency"],
        message: "Add a salary currency when setting a salary range.",
      });
    }
    if (
      profile.salaryMin !== null &&
      profile.salaryMax !== null &&
      profile.salaryMin > profile.salaryMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message: "Salary maximum must be at least the salary minimum.",
      });
    }
  });

export function parseProfileRequest(formData: FormData): ProfileRequestResult {
  const parsed = profileSchema.safeParse({
    id: optionalFormValue(formData, "id"),
    name: formData.get("name"),
    titleTerms: formData.get("titleTerms"),
    locationTerms: formData.get("locationTerms"),
    requiredJobTerms: formData.get("requiredJobTerms") ?? "",
    excludedTitleTerms: formData.get("excludedTitleTerms") ?? "",
    excludedLocationTerms: formData.get("excludedLocationTerms") ?? "",
    excludedDescriptionTerms: formData.get("excludedDescriptionTerms") ?? "",
    includeRemote: formData.get("includeRemote") === "on",
    includeUnverified: formData.get("includeUnverified") === "on",
    salaryCurrency: formData.get("salaryCurrency") ?? "",
    salaryMin: formData.get("salaryMin"),
    salaryMax: formData.get("salaryMax"),
    maxAgeDays: formData.get("maxAgeDays"),
    minScore: formData.get("minScore"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid profile",
    };
  }

  const values = parsed.data;
  const definition = createSearchProfileDefinition({
    name: values.name,
    targetTitles: values.titleTerms,
    targetLocations: values.locationTerms,
    requiredJobTerms: values.requiredJobTerms,
    excludedTitleTerms: values.excludedTitleTerms,
    excludedLocationTerms: values.excludedLocationTerms,
    excludedDescriptionTerms: values.excludedDescriptionTerms,
    includeRemote: values.includeRemote,
    includeUnverified: values.includeUnverified,
    salaryPreference: {
      currency: values.salaryCurrency,
      minimumAnnual: values.salaryMin,
      maximumAnnual: values.salaryMax,
    },
    maximumAgeDays: values.maxAgeDays,
    minimumScore: values.minScore,
  });
  if (definition.status === "invalid") {
    return { ok: false, message: profileDefinitionError(definition) };
  }
  return {
    ok: true,
    command: {
      id: values.id === undefined ? undefined : (searchProfileIdFrom(values.id) ?? undefined),
      profile: definition.profile,
    },
  };
}

function profileDefinitionError(
  result: Extract<SearchProfileDefinitionResult, { status: "invalid" }>,
): string {
  switch (result.reason) {
    case "invalid-name":
      return "Profile name must be between 2 and 120 characters.";
    case "missing-target-title":
      return "Add at least one target job title.";
    case "missing-target-location":
      return "Add at least one target location.";
    case "salary-currency-required":
      return "Add a salary currency when setting a salary range.";
    case "invalid-salary-range":
      return "Enter a valid annual salary range.";
    case "invalid-maximum-age":
      return "Maximum age must be between 1 and 365 days.";
    case "invalid-minimum-score":
      return "Minimum score must be between 0 and 100.";
  }
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

function optionalFormValue(formData: FormData, key: string): FormDataEntryValue | undefined {
  const value = formData.get(key);
  return value === null || value === "" ? undefined : value;
}
