import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type {
  AdapterPolicySnapshot,
  SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";

export const codexAdapterId = "codex-cli-research:v1";

export function createCodexAdapterPolicy(
  settings: RecruiterResearchSettings,
): AdapterPolicySnapshot {
  return {
    allowedPublicSourceScope: ["Public HTTPS firm pages", "Public professional profile pages"],
    authorization: {
      reference: "Local Codex CLI signed in to the operator's own plan",
      reviewedOn: "2026-09-01",
    },
    disabledBehavior: "Reject before invoking the local Codex CLI.",
    enabled: true,
    id: codexAdapterId,
    permittedOperations: ["Local Codex CLI research with live web search"],
    permittedPublicData: [
      "Firm details",
      "Named recruiter professional details",
      "Public source excerpts",
    ],
    rateLimit: {
      stageRequestLimit: settings.execution.stageRequestLimit,
      subscriptionExhaustionBehavior:
        "Record a visible Source failure and do not retry automatically.",
    },
    retention: {
      deletionRule:
        "Delete local run records and their Observations when the local workspace data is removed.",
      rule: "Persist only public research Evidence locally.",
    },
    version: "1",
  };
}

export function createCodexSourcePlan(settings: RecruiterResearchSettings): SourcePlanSnapshot {
  return {
    entries: [
      {
        adapterId: codexAdapterId,
        allowedPublicSources: ["Public HTTPS firm pages"],
        id: "codex-firm-research:v1",
        policyVersion: "1",
        stage: "firms",
      },
      {
        adapterId: codexAdapterId,
        allowedPublicSources: ["Public professional profile pages"],
        id: "codex-recruiter-research:v1",
        policyVersion: "1",
        stage: "recruiters",
      },
    ],
    execution: {
      model: settings.execution.model,
      reasoningEffort: settings.execution.reasoningEffort,
      stageTimeoutMs: settings.execution.stageTimeoutMs,
    },
    id: "codex-cli:v1",
    publicSearch: null,
    stageRequestAllowance: {
      firms: settings.execution.stageRequestLimit,
      recruiters: settings.execution.stageRequestLimit,
    },
    version: "1",
  };
}
