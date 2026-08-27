import { redirect } from "react-router";

import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import { parseRecruiterResearchStartRequest } from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-research-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

type RecruiterResearchActionDependencies = {
  readonly assertLocalHost: typeof assertLocalHost;
  readonly cancelResearchRun: typeof recruiterEngagementWeb.cancelResearchRun;
  readonly getTargetLocationOptions: typeof recruiterEngagementWeb.getTargetLocationOptions;
  readonly retryResearchRun: typeof recruiterEngagementWeb.retryResearchRun;
  readonly startResearchRun: typeof recruiterEngagementWeb.startResearchRun;
};

export const recruiterResearchAction = createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun: recruiterEngagementWeb.cancelResearchRun,
  getTargetLocationOptions: recruiterEngagementWeb.getTargetLocationOptions,
  retryResearchRun: recruiterEngagementWeb.retryResearchRun,
  startResearchRun: recruiterEngagementWeb.startResearchRun,
});

export function createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun,
  getTargetLocationOptions,
  retryResearchRun,
  startResearchRun,
}: RecruiterResearchActionDependencies) {
  return async (request: Request) => {
    assertLocalHost(request.headers.get("host") ?? "");
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "start") {
      const parsed = parseRecruiterResearchStartRequest(formData, getTargetLocationOptions());
      if (parsed.status === "invalid") {
        return { error: parsed.message, field: parsed.field };
      }
      const started = await startResearchRun(parsed.command);
      return redirect(`/recruiter-research?run=${encodeURIComponent(started.runId)}`);
    }
    const runId = formData.get("runId");
    if (typeof runId !== "string" || runId.length === 0) {
      return { error: "Select a research run first." };
    }
    if (intent === "cancel") {
      await cancelResearchRun(runId);
      return redirect(`/recruiter-research?run=${encodeURIComponent(runId)}`);
    }
    if (intent === "retry") {
      try {
        const started = await retryResearchRun(runId);
        return redirect(`/recruiter-research?run=${encodeURIComponent(started.runId)}`);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    return { error: "Unknown recruiter research action." };
  };
}
