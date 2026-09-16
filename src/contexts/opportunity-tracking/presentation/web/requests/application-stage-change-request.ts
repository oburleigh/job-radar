import { z } from "zod";

import type { ChangeApplicationStageCommand } from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { APPLICATION_STAGES } from "@/contexts/opportunity-tracking/domain/application-stage";

const requestSchema = z
  .object({
    intent: z.literal("change-application-stage"),
    applicationId: z.coerce.number().int().safe().positive(),
    stage: z.enum(APPLICATION_STAGES),
    changeIntent: z.enum(["advance", "correction"]),
  })
  .strict();

export type ApplicationStageChangeRequestResult =
  | { readonly ok: true; readonly command: ChangeApplicationStageCommand }
  | { readonly ok: false; readonly message: string };

export function parseApplicationStageChangeRequest(
  formData: FormData,
): ApplicationStageChangeRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: "Check the Application stage change and try again." };
  }
  return {
    ok: true,
    command: {
      applicationId: parsed.data.applicationId,
      stage: parsed.data.stage,
      intent: parsed.data.changeIntent,
    },
  };
}
