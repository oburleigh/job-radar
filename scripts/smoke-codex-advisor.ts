import { tmpdir } from "node:os";
import { createAdvisorWorkflow } from "@/contexts/opportunity-tracking/application/advisor-workflow";
import { createRelationshipPlanWorkflow } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import { createCodexAdvisor } from "@/contexts/opportunity-tracking/infrastructure/advisor-adapter";
import { defaultAdvisorPolicy } from "@/contexts/opportunity-tracking/infrastructure/sqlite/advisor-settings";
import { createRecordingAdvisorHistory } from "@/contexts/opportunity-tracking/test-support/recording-advisor-history";
import { createCodexCliClient } from "@/platform/codex-cli-client";

const policy = { ...defaultAdvisorPolicy, enabled: true };
const opportunity = {
  searchProfileId: 1,
  jobListingId: 1,
  title: "Synthetic engineering role for a local contract test",
  companyName: "Synthetic Example",
  locationText: "Unspecified",
  canonicalUrl: "https://example.com/synthetic-role",
  applyUrl: "https://example.com/synthetic-role",
  listingIsActive: true,
  lastSeenAt: new Date(),
  matchScore: 70,
  description: "Lead platform engineering across three teams.",
  searchCriteria: {
    titleTerms: ["Engineering Director"],
    locationTerms: ["London"],
    requiredJobTerms: [],
    excludedTitleTerms: [],
    excludedLocationTerms: [],
    excludedDescriptionTerms: [],
    includeRemote: false,
    salaryCurrency: "GBP",
    salaryMin: null,
    salaryMax: null,
  },
  matchReasons: [],
  verified: false,
};
const advisor = createCodexAdvisor({
  client: createCodexCliClient({
    binaryPath: process.env.JOB_RADAR_CODEX_BINARY || "codex",
    scratchDirectory: tmpdir(),
  }),
});
const now = () => new Date();
const assessmentWorkflow = createAdvisorWorkflow({
  history: createRecordingAdvisorHistory(),
  advisor,
  now,
  assessments: { save: () => undefined },
});
const relationshipWorkflow = createRelationshipPlanWorkflow({
  history: createRecordingAdvisorHistory(),
  advisor,
  now,
  plans: { save: () => undefined },
  publicPeople: { verify: async () => false },
});

for (const capability of ["assessment", "relationship-plan"] as const) {
  const started = Date.now();
  const result =
    capability === "assessment"
      ? await assessmentWorkflow.assess({ opportunity, policy })
      : await relationshipWorkflow.plan({ applicationId: 1, opportunity, prospects: [], policy });
  console.log(
    JSON.stringify({
      capability,
      status: result.status,
      durationMs: Date.now() - started,
      model: policy.model,
      schemaVersion: policy.schemaVersion,
      acceptedFields:
        result.status === "completed"
          ? Object.keys("assessment" in result ? result.assessment : result.plan)
          : [],
    }),
  );
  if (result.status !== "completed") process.exitCode = 1;
}
