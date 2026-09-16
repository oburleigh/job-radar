import { z } from "zod";

const requestSchema = z
  .object({
    intent: z.literal("plan-relationship"),
    applicationId: z.coerce.number().int().safe().positive(),
  })
  .strict();

export function parseRelationshipPlanRequest(
  formData: FormData,
):
  | { readonly ok: true; readonly applicationId: number }
  | { readonly ok: false; readonly message: string } {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  return parsed.success
    ? { ok: true, applicationId: parsed.data.applicationId }
    : { ok: false, message: "Check the Relationship plan request and try again." };
}
