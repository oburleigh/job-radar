import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type {
  AdapterPolicySnapshot,
  SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";

export function publicWebAdapterId(providerName: string): string {
  return `public-web-search:${providerName}:v1`;
}

export function createPublicWebAdapterPolicy(
  settings: RecruiterResearchSettings,
): AdapterPolicySnapshot {
  const adapterId = publicWebAdapterId(settings.publicSearch.providerName);
  return {
    allowedPublicSourceScope: ["Public HTTPS firm pages", "Public professional profile pages"],
    authorization: {
      reference: "Configured public web search provider contract",
      reviewedOn: "2026-08-31",
    },
    disabledBehavior: "Reject before making a provider request.",
    enabled: true,
    id: adapterId,
    permittedOperations: ["Public web search"],
    permittedPublicData: [
      "Firm details",
      "Named recruiter professional details",
      "Public source excerpts",
    ],
    rateLimit: {
      stageRequestLimit: settings.publicSearch.stageRequestLimit,
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

export function createPublicWebSourcePlan(settings: RecruiterResearchSettings): SourcePlanSnapshot {
  const { providerName, stageRequestLimit, ...publicSearch } = settings.publicSearch;
  const adapterId = publicWebAdapterId(providerName);
  return {
    entries: [
      {
        adapterId,
        allowedPublicSources: ["Public HTTPS firm pages"],
        id: `public-firm-web:${providerName}:v1`,
        policyVersion: "1",
        stage: "firms",
      },
      {
        adapterId,
        allowedPublicSources: ["Public professional profile pages"],
        id: `public-recruiter-profile:${providerName}:v1`,
        policyVersion: "1",
        stage: "recruiters",
      },
    ],
    execution: null,
    id: `public-web:${providerName}:v1`,
    publicSearch,
    stageRequestAllowance: {
      firms: stageRequestLimit,
      recruiters: stageRequestLimit,
    },
    version: "1",
  };
}
