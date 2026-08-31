import { redirect } from "react-router";
import type { ForManagingShortlists } from "@/contexts/recruiter-engagement/application/shortlists/manage-shortlists";
import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import { parseRecruiterDirectoryRequest } from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-directory-request";
import {
  parseRecruiterResearchStartRequest,
  recruiterTargetLocationValues,
} from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-research-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

type RecruiterResearchActionDependencies = {
  readonly assertLocalHost: typeof assertLocalHost;
  readonly cancelResearchRun: typeof recruiterEngagementWeb.cancelResearchRun;
  readonly correctDirectoryFact: typeof recruiterEngagementWeb.correctDirectoryFact;
  readonly resolveTargetLocations: typeof recruiterEngagementWeb.resolveTargetLocations;
  readonly retryResearchRun: typeof recruiterEngagementWeb.retryResearchRun;
  readonly resolveDirectoryIdentity: typeof recruiterEngagementWeb.resolveDirectoryIdentity;
  readonly shortlists: Pick<
    ForManagingShortlists,
    "addProspect" | "create" | "delete" | "removeProspect" | "setContactExclusion"
  >;
  readonly startResearchRun: typeof recruiterEngagementWeb.startResearchRun;
};

const directoryIntents = new Set([
  "resolve-identity",
  "correct-directory-fact",
  "create-shortlist",
  "add-prospect",
  "set-contact-exclusion",
  "remove-prospect",
  "delete-shortlist",
]);

export const recruiterResearchAction = createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun: recruiterEngagementWeb.cancelResearchRun,
  correctDirectoryFact: recruiterEngagementWeb.correctDirectoryFact,
  resolveTargetLocations: recruiterEngagementWeb.resolveTargetLocations,
  retryResearchRun: recruiterEngagementWeb.retryResearchRun,
  resolveDirectoryIdentity: recruiterEngagementWeb.resolveDirectoryIdentity,
  shortlists: recruiterEngagementWeb.shortlists,
  startResearchRun: recruiterEngagementWeb.startResearchRun,
});

export function createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun,
  correctDirectoryFact,
  resolveTargetLocations,
  retryResearchRun,
  resolveDirectoryIdentity,
  shortlists,
  startResearchRun,
}: RecruiterResearchActionDependencies) {
  return async (request: Request) => {
    assertLocalHost(request.headers.get("host") ?? "");
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "start") {
      const parsed = parseRecruiterResearchStartRequest(
        formData,
        resolveTargetLocations(recruiterTargetLocationValues(formData)),
      );
      if (parsed.status === "invalid") {
        return { error: parsed.message, field: parsed.field };
      }
      try {
        const started = await startResearchRun(parsed.command);
        return redirect(`/recruiter-search?run=${encodeURIComponent(started.runId)}`);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          field: "providerName" as const,
        };
      }
    }
    const runId = formData.get("runId");
    if (typeof runId !== "string" || runId.length === 0) {
      return { error: "Select a research run first." };
    }
    if (typeof intent === "string" && directoryIntents.has(intent)) {
      const parsed = parseRecruiterDirectoryRequest(intent, formData);
      if (!parsed.ok) {
        return { error: parsed.message };
      }
      try {
        switch (parsed.command.intent) {
          case "resolve-identity":
            await resolveDirectoryIdentity({
              decision: parsed.command.decision,
              reviewId: parsed.command.reviewId,
            });
            break;
          case "correct-directory-fact":
            await correctDirectoryFact({
              field: parsed.command.field,
              kind: parsed.command.kind,
              recordId: parsed.command.recordId,
              value: parsed.command.value,
            });
            break;
          case "create-shortlist":
            await shortlists.create({ name: parsed.command.name });
            break;
          case "add-prospect":
            await shortlists.addProspect({
              recruiterId: parsed.command.recruiterId,
              shortlistId: parsed.command.shortlistId,
            });
            break;
          case "set-contact-exclusion":
            await shortlists.setContactExclusion({
              contactExclusion: parsed.command.contactExclusion,
              recruiterId: parsed.command.recruiterId,
              shortlistId: parsed.command.shortlistId,
            });
            break;
          case "remove-prospect":
            await shortlists.removeProspect({
              recruiterId: parsed.command.recruiterId,
              shortlistId: parsed.command.shortlistId,
            });
            break;
          case "delete-shortlist":
            await shortlists.delete({ shortlistId: parsed.command.shortlistId });
        }
        return redirect(`/recruiter-search?run=${encodeURIComponent(runId)}`);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (intent === "cancel") {
      await cancelResearchRun(runId);
      return redirect(`/recruiter-search?run=${encodeURIComponent(runId)}`);
    }
    if (intent === "retry") {
      try {
        const started = await retryResearchRun(runId);
        return redirect(`/recruiter-search?run=${encodeURIComponent(started.runId)}`);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    return { error: "Unknown recruiter research action." };
  };
}
