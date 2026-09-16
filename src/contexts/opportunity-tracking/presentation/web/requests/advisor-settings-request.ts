import { z } from "zod";
import { advisorReasoningEfforts } from "@/contexts/opportunity-tracking/application/advisor-workflow";

const schema = z
  .object({
    intent: z.literal("save-advisor-settings"),
    enabled: z.literal("on").optional(),
    model: z.string().trim().min(1),
    reasoningEffort: z.enum(advisorReasoningEfforts),
    timeoutMs: z.coerce.number().int().safe().min(1_000),
    outputLimit: z.coerce.number().int().safe().positive(),
  })
  .strict();

export function parseAdvisorSettingsRequest(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, message: "Invalid Advisor settings request." };
  const { intent: _intent, enabled, ...execution } = parsed.data;
  return { ok: true as const, command: { ...execution, enabled: enabled === "on" } };
}
