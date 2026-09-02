import { z } from "zod";

import {
  areCatalogueTargetLocations,
  type TargetLocationOption,
} from "@/contexts/recruiter-engagement/application/research-runs/target-locations";

const requestSchema = z.object({
  brief: z.string().trim().max(1_000),
  firmTarget: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
  industries: z.string().trim().min(1).transform(criteriaItems),
  providerName: z.string().trim().min(1).optional(),
  recruiterTarget: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
  specialisms: z.string().trim().min(1).transform(criteriaItems),
  targetLocations: z.array(z.string().trim().min(1)).min(1),
});

export type RecruiterResearchStartRequest =
  | {
      readonly status: "valid";
      readonly command: {
        readonly brief: string;
        readonly criteria: {
          readonly industries: readonly string[];
          readonly specialisms: readonly string[];
          readonly targetLocations: readonly string[];
        };
        readonly firmTarget: number;
        readonly providerName?: string;
        readonly recruiterTarget: number;
      };
    }
  | {
      readonly status: "invalid";
      readonly field: RecruiterResearchStartField;
      readonly message: string;
    };

export type RecruiterResearchStartField =
  | "brief"
  | "firmTarget"
  | "industries"
  | "providerName"
  | "recruiterTarget"
  | "specialisms"
  | "targetLocations";

export function parseRecruiterResearchStartRequest(
  formData: FormData,
  options: readonly TargetLocationOption[],
): RecruiterResearchStartRequest {
  const result = requestSchema.safeParse({
    brief: formData.get("brief"),
    firmTarget: formData.get("firmTarget"),
    industries: formData.get("industries"),
    providerName: formData.get("providerName") ?? undefined,
    recruiterTarget: formData.get("recruiterTarget"),
    specialisms: formData.get("specialisms"),
    targetLocations: formData
      .getAll("targetLocations")
      .flatMap((value) => (typeof value === "string" ? value.split("\n") : [])),
  });
  if (!result.success) {
    const field = validationField(result.error.issues[0]?.path[0]);
    return { status: "invalid", field, message: validationMessage(field) };
  }
  if (result.data.firmTarget > result.data.recruiterTarget) {
    return {
      status: "invalid",
      field: "firmTarget",
      message: "Firms to find cannot exceed recruiters to find.",
    };
  }
  if (!areCatalogueTargetLocations(result.data.targetLocations, options)) {
    return {
      status: "invalid",
      field: "targetLocations",
      message: "Choose target locations from the catalogue.",
    };
  }
  return {
    status: "valid",
    command: {
      brief: result.data.brief,
      criteria: {
        industries: result.data.industries,
        specialisms: result.data.specialisms,
        targetLocations: canonicalTargetLocations(result.data.targetLocations, options),
      },
      firmTarget: result.data.firmTarget,
      ...(result.data.providerName ? { providerName: result.data.providerName } : {}),
      recruiterTarget: result.data.recruiterTarget,
    },
  };
}

export function recruiterTargetLocationValues(formData: FormData): readonly string[] {
  return formData
    .getAll("targetLocations")
    .flatMap((value) => (typeof value === "string" ? value.split("\n") : []))
    .map((value) => value.trim())
    .filter(Boolean);
}

function canonicalTargetLocations(
  values: readonly string[],
  options: readonly TargetLocationOption[],
): readonly string[] {
  return values.map((value) => {
    const option = options.find(
      (candidate) => candidate.label.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    return option?.label ?? value;
  });
}

function validationField(field: PropertyKey | undefined): RecruiterResearchStartField {
  switch (field) {
    case "industries":
    case "providerName":
    case "firmTarget":
    case "recruiterTarget":
    case "specialisms":
    case "targetLocations":
      return field;
    default:
      return "brief";
  }
}

function validationMessage(field: RecruiterResearchStartField): string {
  switch (field) {
    case "industries":
      return "Target industries are required.";
    case "providerName":
      return "Choose a configured search provider.";
    case "firmTarget":
      return "Firms to find must be a positive integer.";
    case "recruiterTarget":
      return "Recruiters to find must be a positive integer.";
    case "specialisms":
      return "Specialisms are required.";
    case "targetLocations":
      return "Choose at least one target location from the catalogue.";
    default:
      return "Search brief details are invalid.";
  }
}

function criteriaItems(value: string): readonly string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
