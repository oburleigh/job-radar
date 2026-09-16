import { z } from "zod";

import type { StartApplicationCommand } from "@/contexts/opportunity-tracking/application/opportunity-workflow";

const requestSchema = z
  .object({
    searchProfileId: z.coerce.number().int().safe().positive(),
    jobListingId: z.coerce.number().int().safe().positive(),
    stage: z.enum(["preparing", "applied"]),
  })
  .strict();

export type StartApplicationRequestResult =
  | { readonly ok: true; readonly command: StartApplicationCommand }
  | { readonly ok: false; readonly message: string };

export function parseStartApplicationRequest(formData: FormData): StartApplicationRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: "Check the Application start details and try again." };
  }
  return {
    ok: true,
    command: {
      searchProfileId: parsed.data.searchProfileId,
      jobListingId: parsed.data.jobListingId,
      stage: parsed.data.stage,
    },
  };
}
