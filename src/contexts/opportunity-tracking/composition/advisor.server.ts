import { tmpdir } from "node:os";
import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { createConfiguredWebSearchClient } from "@/contexts/discovery/public-web-search.server";
import type { AdvisorHistory } from "@/contexts/opportunity-tracking/application/advisor-history";
import type {
  AdvisorPolicy,
  OpportunityForAssessment,
} from "@/contexts/opportunity-tracking/application/advisor-workflow";
import {
  advisorReasoningEfforts,
  createAdvisorWorkflow,
} from "@/contexts/opportunity-tracking/application/advisor-workflow";
import {
  createRelationshipPlanWorkflow,
  type ProspectForRelationshipPlan,
  type RelationshipPlanAdvisor,
  type StoredRelationshipPlan,
} from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import { opportunityTracking } from "@/contexts/opportunity-tracking/composition/opportunity-tracking.server";
import { createCodexAdvisor } from "@/contexts/opportunity-tracking/infrastructure/advisor-adapter";
import { createPublicPersonEvidenceVerifier } from "@/contexts/opportunity-tracking/infrastructure/public-person-evidence";
import { createSqliteAdvisorHistory } from "@/contexts/opportunity-tracking/infrastructure/sqlite/advisor-history";
import {
  getAdvisorPolicy,
  saveAdvisorSettings,
} from "@/contexts/opportunity-tracking/infrastructure/sqlite/advisor-settings";
import { opportunityTrackingDatabase } from "@/contexts/opportunity-tracking/infrastructure/sqlite/database";
import { createSqliteAssessmentStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-assessment-store";
import { createSqliteRelationshipPlanStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-relationship-plan-store";
import {
  recruiterEngagementProspectContract,
  recruiterResearchSettingsContract,
} from "@/contexts/recruiter-engagement/public-contract.server";
import { createCodexCliClient } from "@/platform/codex-cli-client";

const history = createSqliteAdvisorHistory(opportunityTrackingDatabase);
const assessments = createSqliteAssessmentStore(opportunityTrackingDatabase);
const advisor = createCodexAdvisor({
  client: createCodexCliClient({
    binaryPath: process.env.JOB_RADAR_CODEX_BINARY || "codex",
    scratchDirectory: tmpdir(),
  }),
});
const workflow = createAdvisorWorkflow({
  history,
  advisor,
  assessments,
  now: () => new Date(),
});
const relationshipPlans = createSqliteRelationshipPlanStore(opportunityTrackingDatabase);
const relationshipPlanning = createRelationshipPlanComposition({
  history,
  advisor,
  applications: {
    findById: (applicationId) =>
      opportunityTracking
        .listApplications()
        .find((application) => application.id === applicationId),
  },
  now: () => new Date(),
  opportunities: discoveryOpportunityContract,
  plans: relationshipPlans,
  publicPeople: () => {
    const policy = recruiterResearchSettingsContract.getPublicSearchSettings();
    return createPublicPersonEvidenceVerifier({
      search: createConfiguredWebSearchClient(policy.providerName),
      resultsPerQuery: policy.resultsPerQuery,
      requestLimit: policy.stageRequestLimit,
    });
  },
  policy: () => getAdvisorPolicy(opportunityTrackingDatabase),
  prospects: recruiterEngagementProspectContract,
});

export function createRelationshipPlanComposition(dependencies: {
  readonly history: AdvisorHistory;
  readonly advisor: RelationshipPlanAdvisor;
  readonly applications: {
    readonly findById: (applicationId: number) =>
      | {
          readonly id: number;
          readonly searchProfileId: number;
          readonly jobListingId: number;
        }
      | undefined;
  };
  readonly now: () => Date;
  readonly opportunities: {
    readonly getOpportunitySnapshot: (reference: {
      readonly searchProfileId: number;
      readonly jobListingId: number;
    }) => OpportunityForAssessment | null;
  };
  readonly plans: {
    readonly latest: (applicationId: number) => StoredRelationshipPlan | undefined;
    readonly save: (plan: StoredRelationshipPlan) => void;
  };
  readonly publicPeople: () => Parameters<typeof createRelationshipPlanWorkflow>[0]["publicPeople"];
  readonly policy: () => AdvisorPolicy;
  readonly prospects: {
    readonly listProspects: () => Promise<readonly ProspectForRelationshipPlan[]>;
  };
}) {
  return {
    latestRelationshipPlan: dependencies.plans.latest,
    async planRelationship(applicationId: number, signal?: AbortSignal) {
      const application = dependencies.applications.findById(applicationId);
      if (!application) return { status: "application-not-found" as const };

      const policy = structuredClone(dependencies.policy());
      if (!policy.enabled) return { status: "disabled" as const };

      const opportunity = dependencies.opportunities.getOpportunitySnapshot(application);
      if (!opportunity) return { status: "opportunity-not-found" as const };

      let publicPeople: Parameters<typeof createRelationshipPlanWorkflow>[0]["publicPeople"];
      try {
        publicPeople = dependencies.publicPeople();
      } catch (error) {
        // An unavailable search provider matters only when a plan needs public-person verification.
        publicPeople = {
          verify: async () => {
            throw error;
          },
        };
      }
      const deadline = AbortSignal.timeout(policy.timeoutMs);
      const executionSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const relationshipWorkflow = createRelationshipPlanWorkflow({
        history: dependencies.history,
        advisor: dependencies.advisor,
        plans: dependencies.plans,
        publicPeople,
        now: dependencies.now,
      });
      return relationshipWorkflow.plan({
        applicationId,
        opportunity,
        prospects: await dependencies.prospects.listProspects(),
        policy,
        signal: executionSignal,
      });
    },
  };
}

export const opportunityAdvisor = {
  listExecutions: history.list,
  latestExecution: history.latest,
  async assess(
    opportunity: Parameters<typeof workflow.assess>[0]["opportunity"],
    signal?: AbortSignal,
  ) {
    try {
      return await workflow.assess({
        opportunity,
        policy: getAdvisorPolicy(opportunityTrackingDatabase),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      return {
        status: "failed" as const,
        message: error instanceof Error ? error.message : "Advisor failed.",
      };
    }
  },
  ...relationshipPlanning,
  latestAssessment: assessments.latest,
  policy: () => getAdvisorPolicy(opportunityTrackingDatabase),
  reasoningEfforts: advisorReasoningEfforts,
  saveSettings: (command: Parameters<typeof saveAdvisorSettings>[1]) =>
    saveAdvisorSettings(opportunityTrackingDatabase, command),
};
