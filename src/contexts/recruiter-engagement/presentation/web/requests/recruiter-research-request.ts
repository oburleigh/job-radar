import { z } from "zod";

import {
  areConfiguredTargetLocations,
  type TargetLocationOption,
} from "@/contexts/recruiter-engagement/application/research-runs/target-locations";

const requestSchema = z.object({
  brief: z.string().trim().max(1_000),
  industries: z.string().trim().min(1).transform(criteriaItems),
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
  | "industries"
  | "recruiterTarget"
  | "specialisms"
  | "targetLocations";

export function parseRecruiterResearchStartRequest(
  formData: FormData,
  options: readonly TargetLocationOption[],
): RecruiterResearchStartRequest {
  const result = requestSchema.safeParse({
    brief: formData.get("brief"),
    industries: formData.get("industries"),
    recruiterTarget: formData.get("recruiterTarget"),
    specialisms: formData.get("specialisms"),
    targetLocations: formData.getAll("targetLocations"),
  });
  if (!result.success) {
    const field = validationField(result.error.issues[0]?.path[0]);
    return { status: "invalid", field, message: validationMessage(field) };
  }
  if (!areConfiguredTargetLocations(result.data.targetLocations, options)) {
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
        targetLocations: result.data.targetLocations,
      },
      recruiterTarget: result.data.recruiterTarget,
    },
  };
}

function validationField(field: PropertyKey | undefined): RecruiterResearchStartField {
  switch (field) {
    case "industries":
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
    case "recruiterTarget":
      return "Recruiters to find must be a positive integer.";
    case "specialisms":
      return "Technology specialisms are required.";
    case "targetLocations":
      return "Choose at least one target location from the catalogue.";
    default:
      return "Technology brief details are invalid.";
  }
}

function criteriaItems(value: string): readonly string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
