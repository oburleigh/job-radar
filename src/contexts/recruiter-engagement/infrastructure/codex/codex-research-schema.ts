import { z } from "zod";

const httpsUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Expected an absolute https URL.");

const confidence = z.enum(["high", "medium", "low"]);

export const codexFirmSchema = z.object({
  companyName: z.string().min(1),
  confidence,
  excerpt: z.string().min(1),
  hasCurrentMandatesOrActivity: z.boolean(),
  hasNamedRecruiterOrTeamEvidence: z.boolean(),
  hasScaleOrTrackRecord: z.boolean(),
  industries: z.array(z.string().min(1)),
  reason: z.string().min(1),
  sourceUrl: httpsUrl,
  specialisms: z.array(z.string().min(1)),
  targetMarkets: z.array(z.string().min(1)),
  websiteUrl: httpsUrl,
});

export const codexRecruiterSchema = z.object({
  companyName: z.string().min(1),
  confidence,
  excerpt: z.string().min(1),
  name: z.string().min(1),
  profileUrl: httpsUrl,
  sourceUrl: httpsUrl,
  title: z.string().min(1),
});

export const codexFirmReplySchema = z.object({ firms: z.array(codexFirmSchema) });
export const codexRecruiterReplySchema = z.object({ recruiters: z.array(codexRecruiterSchema) });

export type CodexFirm = z.infer<typeof codexFirmSchema>;
export type CodexRecruiter = z.infer<typeof codexRecruiterSchema>;
export type CodexFirmReply = z.infer<typeof codexFirmReplySchema>;
export type CodexRecruiterReply = z.infer<typeof codexRecruiterReplySchema>;

export const codexFirmJsonSchema = z.toJSONSchema(codexFirmReplySchema);
export const codexRecruiterJsonSchema = z.toJSONSchema(codexRecruiterReplySchema);
