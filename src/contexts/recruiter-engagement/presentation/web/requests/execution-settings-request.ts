import { z } from "zod";

import type { ExecutionSettingsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-execution-settings";

const requestSchema = z.object({
  model: z.string().trim().min(1),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  stageRequestLimit: z.coerce.number().int().safe().positive(),
  stageTimeoutMs: z.coerce.number().int().safe().min(1_000),
});

export type ExecutionSettingsRequestResult =
  | { readonly ok: true; readonly command: ExecutionSettingsCommand }
  | {
      readonly ok: false;
      readonly field: keyof ExecutionSettingsCommand;
      readonly message: string;
    };

export function parseExecutionSettingsRequest(formData: FormData): ExecutionSettingsRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return { ok: true, command: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "model") as keyof ExecutionSettingsCommand;
  return { field, message: issue?.message ?? "Invalid research execution setting.", ok: false };
}
