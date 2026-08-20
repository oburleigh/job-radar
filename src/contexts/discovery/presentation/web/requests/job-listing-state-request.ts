import { z } from "zod";

import type { ChangeJobListingStateCommand } from "@/contexts/discovery/application/job-listings/change-state/command";
import { jobListingIdFrom, searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import { JOB_LISTING_STATES } from "@/contexts/discovery/domain/job-listing-state";

const requestSchema = z.object({
  profileId: identifier(searchProfileIdFrom),
  jobId: identifier(jobListingIdFrom),
  status: z.enum(JOB_LISTING_STATES),
});

export type JobListingStateRequestResult =
  | { readonly ok: true; readonly command: ChangeJobListingStateCommand }
  | { readonly ok: false; readonly message: string };

export function parseJobListingStateRequest(formData: FormData): JobListingStateRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: "Invalid job status request." };
  }
  return {
    ok: true,
    command: {
      profileId: parsed.data.profileId,
      jobId: parsed.data.jobId,
      state: parsed.data.status,
    },
  };
}

function identifier<T>(factory: (value: number) => T | null) {
  return z.coerce
    .number()
    .int()
    .positive()
    .transform((value, context) => {
      const identifier = factory(value);
      if (identifier === null) {
        context.addIssue({ code: "custom", message: "Identifier must be a positive integer." });
        return z.NEVER;
      }
      return identifier;
    });
}
