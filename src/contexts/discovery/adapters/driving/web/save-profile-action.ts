import { z } from "zod";

import type { SaveSearchProfile } from "../../../hexagon/application/save-search-profile";

export type ProfileActionState = {
  readonly ok: boolean;
  readonly message: string;
};

type SaveProfileActionDependencies = {
  readonly assertLocalRequest: () => Promise<void>;
  readonly saveSearchProfile: SaveSearchProfile;
  readonly revalidatePath: (path: string) => void;
  readonly redirect: (destination: string) => void;
};

const optionalSalaryAmount = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().positive().max(100_000_000).nullable(),
);

const profileSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(2).max(120),
    titleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    locationTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
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
      .refine((value) => value === "" || /^[A-Z]{3}$/.test(value), {
        message: "Salary currency must be a three-letter code such as GBP.",
      }),
    salaryMin: optionalSalaryAmount,
    salaryMax: optionalSalaryAmount,
    maxAgeDays: z.coerce.number().int().min(1).max(365),
    minScore: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((profile, context) => {
    if ((profile.salaryMin !== null || profile.salaryMax !== null) && !profile.salaryCurrency) {
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

export function createSaveProfileAction({
  assertLocalRequest,
  saveSearchProfile,
  revalidatePath,
  redirect,
}: SaveProfileActionDependencies) {
  return async (_previous: ProfileActionState, formData: FormData): Promise<ProfileActionState> => {
    await assertLocalRequest();
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
    const result = saveSearchProfile({
      id: values.id,
      profile: {
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
      },
    });
    if (result.status === "duplicate-name") {
      return { ok: false, message: "A profile with that name already exists." };
    }

    revalidatePath("/");
    revalidatePath("/profiles");
    if (result.created) {
      redirect(`/profiles?profile=${result.id}`);
    }
    return { ok: true, message: "Profile saved." };
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

function optionalFormValue(formData: FormData, key: string): FormDataEntryValue | undefined {
  const value = formData.get(key);
  return value === null || value === "" ? undefined : value;
}
