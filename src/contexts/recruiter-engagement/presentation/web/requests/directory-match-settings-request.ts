import { z } from "zod";
import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

const weight = z.coerce.number().int().min(0).max(100);
const requestSchema = z
  .object({
    currentActivity: weight,
    evidenceFreshnessAndQuality: weight,
    recruiterRoleAndSeniority: weight,
    specialism: weight,
  })
  .refine((weights) => Object.values(weights).reduce((total, value) => total + value, 0) === 100, {
    message: "Directory match weights must total 100.",
  });

export type DirectoryMatchSettingsRequestResult =
  | { readonly ok: true; readonly command: DirectoryMatchWeights }
  | { readonly ok: false; readonly message: string };

export function parseDirectoryMatchSettingsRequest(
  formData: FormData,
): DirectoryMatchSettingsRequestResult {
  const parsed = requestSchema.safeParse({
    currentActivity: formData.get("currentActivity"),
    evidenceFreshnessAndQuality: formData.get("evidenceFreshnessAndQuality"),
    recruiterRoleAndSeniority: formData.get("recruiterRoleAndSeniority"),
    specialism: formData.get("specialism"),
  });
  return parsed.success
    ? { ok: true, command: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid directory match weight." };
}
