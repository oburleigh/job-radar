import { z } from "zod";
import type { DirectoryCorrection } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type { ShortlistProspect } from "@/contexts/recruiter-engagement/domain/shortlist";

const identityReviewRequest = z.object({
  decision: z.enum(["merge", "keep-separate"]),
  reviewId: z.string().trim().min(1),
});
const correctionRequest = z
  .object({
    field: z.enum(["name", "title", "companyName", "workEmail"]),
    kind: z.enum(["firm", "recruiter"]),
    recordId: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .superRefine((request, context) => {
    if (request.field === "workEmail" && !z.email().safeParse(request.value).success) {
      context.addIssue({ code: "custom", message: "Enter a valid work email.", path: ["value"] });
    }
  });
const createShortlistRequest = z.object({ name: z.string().trim().min(1) });
const directoryRecordRequest = z.object({
  kind: z.enum(["firm", "recruiter"], { error: "Choose a firm or a recruiter to remove." }),
  recordId: z.string().trim().min(1),
});
const removalRequest = directoryRecordRequest.extend({
  cascadeRecruiters: z
    .enum(["with-recruiters", "firm-only"], {
      error: "Choose what happens to the recruiters at this firm.",
    })
    .optional(),
});
const prospectRequest = z.object({
  recruiterId: z.string().trim().min(1),
  shortlistId: z.string().trim().min(1),
});
const shortlistRequest = z.object({ shortlistId: z.string().trim().min(1) });
const contactExclusionRequest = prospectRequest.extend({
  contactExclusion: z.enum(["none", "suppressed", "do-not-contact"], {
    error: "Choose a valid contact exclusion.",
  }),
});

type RecruiterDirectoryCommand =
  | {
      readonly intent: "resolve-identity";
      readonly decision: "merge" | "keep-separate";
      readonly reviewId: string;
    }
  | {
      readonly intent: "correct-directory-fact";
      readonly field: DirectoryCorrection["field"];
      readonly kind: DirectoryCorrection["kind"];
      readonly recordId: string;
      readonly value: string;
    }
  | { readonly intent: "create-shortlist"; readonly name: string }
  | {
      readonly intent: "add-prospect" | "remove-prospect";
      readonly recruiterId: string;
      readonly shortlistId: string;
    }
  | {
      readonly contactExclusion: ShortlistProspect["contactExclusion"];
      readonly intent: "set-contact-exclusion";
      readonly recruiterId: string;
      readonly shortlistId: string;
    }
  | { readonly intent: "delete-shortlist"; readonly shortlistId: string }
  | {
      readonly cascadeRecruiters: boolean;
      readonly intent: "remove-directory-record";
      readonly kind: "firm" | "recruiter";
      readonly recordId: string;
    }
  | {
      readonly intent: "restore-directory-record";
      readonly kind: "firm" | "recruiter";
      readonly recordId: string;
    };

export type RecruiterDirectoryRequestResult =
  | {
      readonly ok: true;
      readonly command: RecruiterDirectoryCommand;
    }
  | { readonly ok: false; readonly message: string };

export function parseRecruiterDirectoryRequest(
  intent: FormDataEntryValue | null,
  formData: FormData,
): RecruiterDirectoryRequestResult {
  if (intent === "resolve-identity") {
    const parsed = identityReviewRequest.safeParse({
      decision: formData.get("decision"),
      reviewId: formData.get("reviewId"),
    });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "correct-directory-fact") {
    const parsed = correctionRequest.safeParse({
      field: formData.get("field"),
      kind: formData.get("kind"),
      recordId: formData.get("recordId"),
      value: formData.get("value"),
    });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "create-shortlist") {
    const parsed = createShortlistRequest.safeParse({ name: formData.get("name") });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "add-prospect" || intent === "remove-prospect") {
    const parsed = prospectRequest.safeParse({
      recruiterId: formData.get("recruiterId"),
      shortlistId: formData.get("shortlistId"),
    });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "set-contact-exclusion") {
    const parsed = contactExclusionRequest.safeParse({
      contactExclusion: formData.get("contactExclusion"),
      recruiterId: formData.get("recruiterId"),
      shortlistId: formData.get("shortlistId"),
    });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "remove-directory-record") {
    const parsed = removalRequest.safeParse({
      cascadeRecruiters: formData.get("cascadeRecruiters") ?? undefined,
      kind: formData.get("kind"),
      recordId: formData.get("recordId"),
    });
    if (!parsed.success) {
      return invalidRequest(parsed.error.issues[0]?.message);
    }
    if (parsed.data.kind === "firm" && parsed.data.cascadeRecruiters === undefined) {
      return invalidRequest("Choose what happens to the recruiters at this firm.");
    }
    return {
      ok: true,
      command: {
        cascadeRecruiters: parsed.data.cascadeRecruiters === "with-recruiters",
        intent,
        kind: parsed.data.kind,
        recordId: parsed.data.recordId,
      },
    };
  }
  if (intent === "restore-directory-record") {
    const parsed = directoryRecordRequest.safeParse({
      kind: formData.get("kind"),
      recordId: formData.get("recordId"),
    });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  if (intent === "delete-shortlist") {
    const parsed = shortlistRequest.safeParse({ shortlistId: formData.get("shortlistId") });
    return parsed.success
      ? { ok: true, command: { intent, ...parsed.data } }
      : invalidRequest(parsed.error.issues[0]?.message);
  }
  return { ok: false, message: "Unknown recruiter directory action." };
}

function invalidRequest(message: string | undefined): RecruiterDirectoryRequestResult {
  return { ok: false, message: message ?? "Invalid recruiter directory action." };
}
