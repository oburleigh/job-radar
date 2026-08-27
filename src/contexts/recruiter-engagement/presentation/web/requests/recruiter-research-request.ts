import { z } from "zod";

const requestSchema = z.object({
  brief: z.string().trim().max(1_000),
  geography: z.string().trim().min(1).max(120),
  industries: z.string().trim().min(1).transform(criteriaItems),
  recruiterTarget: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
  specialisms: z.string().trim().min(1).transform(criteriaItems),
});

export type RecruiterResearchStartRequest =
  | {
      readonly status: "valid";
      readonly command: {
        readonly brief: string;
        readonly criteria: {
          readonly geography: string;
          readonly industries: readonly string[];
          readonly specialisms: readonly string[];
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
  | "geography"
  | "industries"
  | "recruiterTarget"
  | "specialisms";

export function parseRecruiterResearchStartRequest(
  formData: FormData,
): RecruiterResearchStartRequest {
  const result = requestSchema.safeParse({
    brief: formData.get("brief"),
    geography: formData.get("geography"),
    industries: formData.get("industries"),
    recruiterTarget: formData.get("recruiterTarget"),
    specialisms: formData.get("specialisms"),
  });
  if (!result.success) {
    const field = validationField(result.error.issues[0]?.path[0]);
    return { status: "invalid", field, message: validationMessage(field) };
  }
  return {
    status: "valid",
    command: {
      brief: result.data.brief,
      criteria: {
        geography: result.data.geography,
        industries: result.data.industries,
        specialisms: result.data.specialisms,
      },
      recruiterTarget: result.data.recruiterTarget,
    },
  };
}

function validationField(field: PropertyKey | undefined): RecruiterResearchStartField {
  switch (field) {
    case "geography":
    case "industries":
    case "recruiterTarget":
    case "specialisms":
      return field;
    default:
      return "brief";
  }
}

function validationMessage(field: RecruiterResearchStartField): string {
  switch (field) {
    case "geography":
      return "Geography is required.";
    case "industries":
      return "Target industries are required.";
    case "recruiterTarget":
      return "Recruiters to find must be a positive integer.";
    case "specialisms":
      return "Technology specialisms are required.";
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
