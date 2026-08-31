import { z } from "zod";

import type { ResearchCriteriaOptionsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-research-criteria-options";

const catalogue = z
  .string()
  .transform((value) => [
    ...new Set(
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().min(1)).min(1));

const requestSchema = z.object({
  industries: catalogue,
  specialisms: catalogue,
});

export type ResearchCriteriaOptionsRequestResult =
  | { readonly ok: true; readonly command: ResearchCriteriaOptionsCommand }
  | {
      readonly ok: false;
      readonly field: keyof ResearchCriteriaOptionsCommand;
      readonly message: string;
    };

export function parseResearchCriteriaOptionsRequest(
  formData: FormData,
): ResearchCriteriaOptionsRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return { ok: true, command: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "industries") as keyof ResearchCriteriaOptionsCommand;
  return { field, message: issue?.message ?? "Invalid Research criteria.", ok: false };
}
