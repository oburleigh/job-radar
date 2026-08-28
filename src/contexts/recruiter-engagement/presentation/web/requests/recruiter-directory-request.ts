import { z } from "zod";
import type { DirectoryCorrection } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

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

export type RecruiterDirectoryRequestResult =
  | {
      readonly ok: true;
      readonly command:
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
          };
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
  return { ok: false, message: "Unknown recruiter directory action." };
}

function invalidRequest(message: string | undefined): RecruiterDirectoryRequestResult {
  return { ok: false, message: message ?? "Invalid recruiter directory action." };
}
