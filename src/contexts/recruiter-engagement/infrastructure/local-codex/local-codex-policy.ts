import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type {
  AdapterPolicySnapshot,
  SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";

export function createLocalCodexAdapterPolicy(
  settings: RecruiterResearchSettings,
): AdapterPolicySnapshot {
  return {
    allowedPublicSourceScope: ["Public HTTPS firm pages", "Public LinkedIn profile results"],
    authorization: {
      reference: "OpenAI Services Agreement and Codex SDK/CLI service documentation",
      reviewedOn: "2026-08-27",
    },
    disabledBehavior: "Reject before starting a local Codex process.",
    enabled: true,
    execution: {
      automaticRetry: false,
      ephemeral: true,
      model: settings.execution.model,
      reasoningEffort: settings.execution.reasoningEffort,
      sandboxMode: "read-only",
      webSearchEnabled: true,
    },
    id: "local-codex-cli-web-search-v1",
    permittedOperations: ["Public web search", "Public LinkedIn profile-result research"],
    permittedPublicData: [
      "Firm details",
      "Named recruiter professional details",
      "Public source excerpts",
    ],
    rateLimit: {
      stageRequestLimit: settings.execution.stageRequestLimit,
      subscriptionExhaustionBehavior:
        "Record a visible source failure and do not retry automatically.",
    },
    retention: {
      deletionRule:
        "Delete local run records and their observations from SQLite when the local workspace data is removed.",
      rule: "Persist only public research evidence locally. Do not persist private, candidate, contact, or session data.",
    },
    version: "1",
  };
}

export function createPublicRecruiterSourcePlan(
  settings: RecruiterResearchSettings,
): SourcePlanSnapshot {
  return {
    entries: [
      {
        adapterId: "local-codex-cli-web-search-v1",
        allowedPublicSources: ["Public HTTPS firm pages"],
        id: "public-firm-web-v1",
        policyVersion: "1",
        stage: "firms",
      },
      {
        adapterId: "local-codex-cli-web-search-v1",
        allowedPublicSources: ["Public LinkedIn profile results"],
        id: "public-linkedin-profile-results-v1",
        policyVersion: "1",
        stage: "recruiters",
      },
    ],
    id: "public-web-linkedin-v1",
    stageRequestAllowance: {
      firms: settings.execution.stageRequestLimit,
      recruiters: settings.execution.stageRequestLimit,
    },
    version: "1",
  };
}
