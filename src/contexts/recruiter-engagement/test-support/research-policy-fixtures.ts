import type { Evidence } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  AdapterPolicySnapshot,
  SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";
import { createSearchBrief } from "@/contexts/recruiter-engagement/domain/research-run";

export const testAdapterPolicy: AdapterPolicySnapshot = {
  allowedPublicSourceScope: ["Public HTTPS firm pages", "Public LinkedIn profile results"],
  authorization: { reference: "test authorization", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  id: "public-web-search:test:v1",
  permittedOperations: ["Public web search", "Public LinkedIn profile-result research"],
  permittedPublicData: ["Public firm and recruiter evidence"],
  rateLimit: { stageRequestLimit: 1, subscriptionExhaustionBehavior: "No automatic retry." },
  retention: { deletionRule: "Delete local fixture data.", rule: "Public evidence only." },
  version: "1",
};

export const testSourcePlan: SourcePlanSnapshot = {
  entries: [
    {
      adapterId: "public-web-search:test:v1",
      allowedPublicSources: ["Public HTTPS firm pages"],
      id: "firms",
      policyVersion: "1",
      stage: "firms",
    },
    {
      adapterId: "public-web-search:test:v1",
      allowedPublicSources: ["Public LinkedIn profile results"],
      id: "recruiters",
      policyVersion: "1",
      stage: "recruiters",
    },
  ],
  id: "public-web-test-v1",
  publicSearch: {
    currentActivityTerms: ["hiring", "jobs", "recruitment"],
    excludedHosts: [],
    firmDiscoveryPhrases: ["recruitment agency"],
    maxPagesPerQuery: 1,
    namedRecruiterOrTeamTerms: ["team"],
    profileSourceHosts: ["linkedin.com/in"],
    recruiterRoleTerms: ["recruiter"],
    resultsPerQuery: 10,
    scaleOrTrackRecordTerms: ["global"],
  },
  stageRequestAllowance: { firms: 1, recruiters: 1 },
  version: "1",
};

export function testEvidence(sourceUrl: string): Evidence {
  return {
    adapterId: "public-web-search:test:v1",
    confidence: "high",
    excerpt: "Public evidence fixture.",
    observedAt: "2026-08-27",
    policyVersion: "1",
    sourceUrl,
  };
}

export function testSearchBrief(
  overrides: {
    readonly description?: string;
    readonly firmTarget?: number;
    readonly recruiterTarget?: number;
  } = {},
) {
  return createSearchBrief({
    criteria: {
      industries: ["Technology"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    description: overrides.description ?? "Technology recruitment",
    firmTarget: overrides.firmTarget ?? 1,
    recruiterTarget: overrides.recruiterTarget ?? 1,
  });
}
