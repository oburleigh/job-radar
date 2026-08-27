import type { Evidence } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  AdapterPolicySnapshot,
  SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";

export const testAdapterPolicy: AdapterPolicySnapshot = {
  allowedPublicSourceScope: ["Public HTTPS firm pages", "Public LinkedIn profile results"],
  authorization: { reference: "test authorization", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  execution: {
    automaticRetry: false,
    ephemeral: true,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    sandboxMode: "read-only",
    webSearchEnabled: true,
  },
  id: "local-codex-cli-web-search-v1",
  permittedOperations: ["Public web search", "Public LinkedIn profile-result research"],
  permittedPublicData: ["Public firm and recruiter evidence"],
  rateLimit: { stageRequestLimit: 1, subscriptionExhaustionBehavior: "No automatic retry." },
  retention: { deletionRule: "Delete local fixture data.", rule: "Public evidence only." },
  version: "1",
};

export const testSourcePlan: SourcePlanSnapshot = {
  entries: [
    {
      adapterId: "local-codex-cli-web-search-v1",
      allowedPublicSources: ["Public HTTPS firm pages"],
      id: "firms",
      policyVersion: "1",
      stage: "firms",
    },
    {
      adapterId: "local-codex-cli-web-search-v1",
      allowedPublicSources: ["Public LinkedIn profile results"],
      id: "recruiters",
      policyVersion: "1",
      stage: "recruiters",
    },
  ],
  id: "public-web-linkedin-v1",
  stageRequestAllowance: { firms: 1, recruiters: 1 },
  version: "1",
};

export function testEvidence(sourceUrl: string): Evidence {
  return {
    adapterId: "local-codex-cli-web-search-v1",
    confidence: "high",
    excerpt: "Public evidence fixture.",
    observedAt: "2026-08-27",
    policyVersion: "1",
    sourceUrl,
  };
}
