import { z } from "zod";

import type { ResearchExecutionSettingsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-execution-settings";

const optionalValue = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));
const requestSchema = z.object({
  model: optionalValue,
  reasoningEffort: optionalValue,
});

export type ResearchExecutionSettingsRequestResult =
  | { readonly ok: true; readonly command: ResearchExecutionSettingsCommand }
  | { readonly ok: false; readonly field: "model" | "reasoningEffort"; readonly message: string };

export function parseResearchExecutionSettingsRequest(
  formData: FormData,
): ResearchExecutionSettingsRequestResult {
  const parsed = requestSchema.safeParse({
    model: formData.get("model") ?? "",
    reasoningEffort: formData.get("reasoningEffort") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: issue?.path[0] === "reasoningEffort" ? "reasoningEffort" : "model",
      message: issue?.message ?? "Invalid local Codex setting.",
    };
  }
  return { ok: true, command: parsed.data };
}
