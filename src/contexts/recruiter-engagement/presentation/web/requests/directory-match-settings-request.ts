import { z } from "zod";
import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

const weight = z.coerce.number().int().min(0).max(100);
const requestSchema = z
  .object({
    currentMandatesOrActivity: weight,
    evidenceFreshnessAndQuality: weight,
    namedRecruiterOrTeamEvidence: weight,
    recruiterRoleAndSeniority: weight,
    scaleOrTrackRecord: weight,
    specialism: weight,
    targetMarketOperatingDepth: weight,
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
    currentMandatesOrActivity: formData.get("currentMandatesOrActivity"),
    evidenceFreshnessAndQuality: formData.get("evidenceFreshnessAndQuality"),
    namedRecruiterOrTeamEvidence: formData.get("namedRecruiterOrTeamEvidence"),
    recruiterRoleAndSeniority: formData.get("recruiterRoleAndSeniority"),
    scaleOrTrackRecord: formData.get("scaleOrTrackRecord"),
    specialism: formData.get("specialism"),
    targetMarketOperatingDepth: formData.get("targetMarketOperatingDepth"),
  });
  return parsed.success
    ? { ok: true, command: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid directory match weight." };
}
