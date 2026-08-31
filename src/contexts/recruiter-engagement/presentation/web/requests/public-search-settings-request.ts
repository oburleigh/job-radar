import { z } from "zod";

import type { PublicSearchSettingsCommand } from "@/contexts/recruiter-engagement/application/research-settings/save-public-search-settings";

const positiveInteger = z.coerce.number().int().safe().positive();
const terms = z.string().transform((value) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean),
);
const requiredTerms = terms.pipe(z.array(z.string().min(1)).min(1));
const requestSchema = z.object({
  currentActivityTerms: requiredTerms,
  excludedHosts: terms,
  firmDiscoveryPhrases: requiredTerms,
  maxPagesPerQuery: positiveInteger,
  namedRecruiterOrTeamTerms: requiredTerms,
  profileSourceHosts: requiredTerms,
  providerName: z.string().trim().min(1),
  recruiterRoleTerms: requiredTerms,
  resultsPerQuery: positiveInteger,
  scaleOrTrackRecordTerms: requiredTerms,
  stageRequestLimit: positiveInteger,
});

export type PublicSearchSettingsRequestResult =
  | { readonly ok: true; readonly command: PublicSearchSettingsCommand }
  | {
      readonly ok: false;
      readonly field: keyof PublicSearchSettingsCommand;
      readonly message: string;
    };

export function parsePublicSearchSettingsRequest(
  formData: FormData,
): PublicSearchSettingsRequestResult {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return { ok: true, command: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "providerName") as keyof PublicSearchSettingsCommand;
  return { field, message: issue?.message ?? "Invalid public search setting.", ok: false };
}
