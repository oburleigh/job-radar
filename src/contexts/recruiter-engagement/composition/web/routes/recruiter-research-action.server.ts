import { redirect } from "react-router";

import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import {
  parseRecruiterResearchStartRequest,
  recruiterTargetLocationValues,
} from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-research-request";
import { parseResearchExecutionSettingsRequest } from "@/contexts/recruiter-engagement/presentation/web/requests/research-execution-settings-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

type RecruiterResearchActionDependencies = {
  readonly assertLocalHost: typeof assertLocalHost;
  readonly cancelResearchRun: typeof recruiterEngagementWeb.cancelResearchRun;
  readonly resolveTargetLocations: typeof recruiterEngagementWeb.resolveTargetLocations;
  readonly retryResearchRun: typeof recruiterEngagementWeb.retryResearchRun;
  readonly saveResearchExecutionSettings: typeof recruiterEngagementWeb.saveResearchExecutionSettings;
  readonly startResearchRun: typeof recruiterEngagementWeb.startResearchRun;
};

export const recruiterResearchAction = createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun: recruiterEngagementWeb.cancelResearchRun,
  resolveTargetLocations: recruiterEngagementWeb.resolveTargetLocations,
  retryResearchRun: recruiterEngagementWeb.retryResearchRun,
  saveResearchExecutionSettings: recruiterEngagementWeb.saveResearchExecutionSettings,
  startResearchRun: recruiterEngagementWeb.startResearchRun,
});

export function createRecruiterResearchAction({
  assertLocalHost,
  cancelResearchRun,
  resolveTargetLocations,
  retryResearchRun,
  saveResearchExecutionSettings,
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
      const execution = parseResearchExecutionSettingsRequest(formData);
      if (!execution.ok) {
        return { error: execution.message };
      }
      saveResearchExecutionSettings(execution.command);
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
