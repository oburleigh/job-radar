import type { AdvisorHistory } from "./advisor-history";
import type {
  AdvisorPolicy,
  OpportunityForAssessment,
  RecommendationProposal,
} from "./advisor-workflow";

export interface ProspectForRelationshipPlan {
  readonly shortlistId: string;
  readonly recruiterId: string;
  readonly name: string;
  readonly title: string;
  readonly companyName: string;
  readonly profileUrl: string;
  readonly evidenceUrls: readonly string[];
}

export interface RelationshipPlanProspectReference {
  readonly shortlistId: string;
  readonly recruiterId: string;
  readonly reason: string;
  readonly evidenceUrls: readonly string[];
}

export interface RelationshipPlanPublicPerson {
  readonly name: string;
  readonly title: string;
  readonly companyName: string;
  readonly profileUrl: string;
  readonly reason: string;
  readonly evidence: readonly { readonly sourceUrl: string; readonly excerpt: string }[];
}

export interface RelationshipPlanProposal {
  readonly summary: string;
  readonly prospectReferences: readonly RelationshipPlanProspectReference[];
  readonly publicPeople: readonly RelationshipPlanPublicPerson[];
  readonly recommendations: readonly RecommendationProposal[];
}

export interface StoredRelationshipPlan extends RelationshipPlanProposal {
  readonly applicationId: number;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly policyVersion: number;
  readonly schemaVersion: number;
  readonly evidenceCutoff: Date;
  readonly createdAt: Date;
}

export interface RelationshipPlanAdvisor {
  planRelationship(input: {
    readonly applicationId: number;
    readonly opportunity: OpportunityForAssessment;
    readonly prospects: readonly ProspectForRelationshipPlan[];
    readonly signal?: AbortSignal;
    readonly evidenceCutoff: Date;
    readonly execution: Pick<
      AdvisorPolicy,
      "model" | "reasoningEffort" | "timeoutMs" | "outputLimit" | "schemaVersion"
    >;
  }): Promise<RelationshipPlanProposal>;
}

export function createRelationshipPlanWorkflow(dependencies: {
  readonly history: AdvisorHistory;
  readonly advisor: RelationshipPlanAdvisor;
  readonly plans: { readonly save: (plan: StoredRelationshipPlan) => void };
  readonly publicPeople: {
    readonly verify: (
      people: readonly RelationshipPlanPublicPerson[],
      signal?: AbortSignal,
    ) => Promise<boolean>;
  };
  readonly now: () => Date;
}) {
  return {
    async plan(input: {
      readonly applicationId: number;
      readonly opportunity: OpportunityForAssessment;
      readonly prospects: readonly ProspectForRelationshipPlan[];
      readonly policy: AdvisorPolicy;
      readonly signal?: AbortSignal;
    }) {
      const policy = { ...input.policy };
      const opportunity = structuredClone(input.opportunity);
      const prospects = structuredClone(input.prospects);
      const applicationId = input.applicationId;
      if (!policy.enabled) return { status: "disabled" as const };
      const evidenceCutoff = dependencies.now();
      const executionId = dependencies.history.start({
        kind: "relationship-plan",
        searchProfileId: opportunity.searchProfileId,
        jobListingId: opportunity.jobListingId,
        applicationId: applicationId,
        policy: policy,
        startedAt: evidenceCutoff,
      });
      try {
        if (input.signal?.aborted) throw new Error("Advisor request cancelled.");
        const proposal = await dependencies.advisor.planRelationship({
          applicationId: applicationId,
          opportunity: opportunity,
          prospects: prospects,
          ...(input.signal ? { signal: input.signal } : {}),
          evidenceCutoff,
          execution: {
            model: policy.model,
            reasoningEffort: policy.reasoningEffort,
            timeoutMs: policy.timeoutMs,
            outputLimit: policy.outputLimit,
            schemaVersion: policy.schemaVersion,
          },
        });
        input.signal?.throwIfAborted();
        const supported =
          hasSupportedRelationshipReferences(proposal, { opportunity, prospects }) &&
          (proposal.publicPeople.length === 0 ||
            (await dependencies.publicPeople.verify(proposal.publicPeople, input.signal)));
        if (
          input.signal?.aborted ||
          dependencies.now().getTime() - evidenceCutoff.getTime() >= policy.timeoutMs
        ) {
          throw new Error("Advisor request cancelled or timed out.");
        }
        if (!supported) {
          dependencies.history.finish({
            id: executionId,
            status: "rejected",
            reason: "unsupported-relationship-reference",
            finishedAt: dependencies.now(),
          });
          return {
            status: "rejected" as const,
            reason: "unsupported-relationship-reference" as const,
          };
        }
        const plan = {
          ...proposal,
          applicationId: applicationId,
          model: policy.model,
          reasoningEffort: policy.reasoningEffort,
          policyVersion: policy.policyVersion,
          schemaVersion: policy.schemaVersion,
          evidenceCutoff,
          createdAt: dependencies.now(),
        } satisfies StoredRelationshipPlan;
        dependencies.plans.save(plan);
        dependencies.history.finish({
          id: executionId,
          status: "completed",
          reason: null,
          finishedAt: dependencies.now(),
        });
        return { status: "completed" as const, plan };
      } catch (error) {
        const finishedAt = dependencies.now();
        const status =
          finishedAt.getTime() - evidenceCutoff.getTime() >= policy.timeoutMs ||
          input.signal?.reason?.name === "TimeoutError"
            ? "timed-out"
            : input.signal?.aborted
              ? "cancelled"
              : "failed";
        dependencies.history.finish({
          id: executionId,
          status,
          reason: status === "failed" ? "advisor-failed" : status,
          finishedAt,
        });
        return {
          status: "failed" as const,
          message:
            status === "cancelled"
              ? "Advisor request cancelled."
              : status === "timed-out"
                ? "Advisor request timed out."
                : error instanceof Error
                  ? error.message
                  : "Advisor failed.",
        };
      }
    },
  };
}

function hasSupportedRelationshipReferences(
  proposal: RelationshipPlanProposal,
  input: {
    readonly opportunity: OpportunityForAssessment;
    readonly prospects: readonly ProspectForRelationshipPlan[];
  },
): boolean {
  const prospects = new Map(
    input.prospects.map((prospect) => [
      `${prospect.shortlistId}:${prospect.recruiterId}`,
      prospect,
    ]),
  );
  for (const reference of proposal.prospectReferences) {
    const prospect = prospects.get(`${reference.shortlistId}:${reference.recruiterId}`);
    if (
      !prospect ||
      reference.evidenceUrls.length === 0 ||
      reference.evidenceUrls.some((url) => !prospect.evidenceUrls.includes(url))
    ) {
      return false;
    }
  }

  const supportedEvidence = new Set([
    input.opportunity.canonicalUrl,
    input.opportunity.applyUrl,
    ...input.prospects.flatMap((prospect) => [prospect.profileUrl, ...prospect.evidenceUrls]),
  ]);
  for (const person of proposal.publicPeople) {
    if (
      person.evidence.length === 0 ||
      !person.evidence.some((evidence) => evidence.sourceUrl === person.profileUrl)
    ) {
      return false;
    }
    for (const evidence of person.evidence) supportedEvidence.add(evidence.sourceUrl);
  }
  return proposal.recommendations.every(
    (recommendation) =>
      recommendation.evidenceUrls.length > 0 &&
      recommendation.evidenceUrls.every((url) => supportedEvidence.has(url)),
  );
}
