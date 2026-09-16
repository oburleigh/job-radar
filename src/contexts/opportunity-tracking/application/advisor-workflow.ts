import type { AdvisorHistory } from "./advisor-history";
export const advisorReasoningEfforts = ["low", "medium", "high", "xhigh"] as const;

export interface AdvisorPolicy {
  readonly enabled: boolean;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly timeoutMs: number;
  readonly outputLimit: number;
  readonly policyVersion: number;
  readonly schemaVersion: number;
}

export interface AssessmentEvidence {
  readonly sourceUrl: string;
  readonly excerpt: string;
}

export interface RecommendationProposal {
  readonly title: string;
  readonly reason: string;
  readonly evidenceUrls: readonly string[];
}

export interface AssessmentStatement {
  readonly text: string;
  readonly evidenceUrls: readonly string[];
}

export interface OpportunityAssessmentProposal {
  readonly summary: AssessmentStatement;
  readonly strengths: readonly AssessmentStatement[];
  readonly gaps: readonly AssessmentStatement[];
  readonly evidence: readonly AssessmentEvidence[];
  readonly recommendations: readonly RecommendationProposal[];
}

export interface OpportunityForAssessment {
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly description: string;
  readonly searchCriteria: {
    readonly titleTerms: readonly string[];
    readonly locationTerms: readonly string[];
    readonly requiredJobTerms: readonly string[];
    readonly excludedTitleTerms: readonly string[];
    readonly excludedLocationTerms: readonly string[];
    readonly excludedDescriptionTerms: readonly string[];
    readonly includeRemote: boolean;
    readonly salaryCurrency: string;
    readonly salaryMin: number | null;
    readonly salaryMax: number | null;
  };
  readonly title: string;
  readonly companyName: string;
  readonly locationText: string;
  readonly canonicalUrl: string;
  readonly applyUrl: string;
  readonly listingIsActive: boolean;
  readonly lastSeenAt: Date;
  readonly matchScore: number;
  readonly matchReasons: readonly unknown[];
  readonly verified: boolean;
}

export interface StoredOpportunityAssessment extends OpportunityAssessmentProposal {
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly policyVersion: number;
  readonly schemaVersion: number;
  readonly evidenceCutoff: Date;
  readonly createdAt: Date;
}

export interface AdvisorPort {
  assess(input: {
    readonly opportunity: OpportunityForAssessment;
    readonly signal?: AbortSignal;
    readonly evidenceCutoff: Date;
    readonly execution: Pick<
      AdvisorPolicy,
      "model" | "reasoningEffort" | "timeoutMs" | "outputLimit" | "schemaVersion"
    >;
  }): Promise<OpportunityAssessmentProposal>;
}

export function createAdvisorWorkflow(dependencies: {
  readonly history: AdvisorHistory;
  readonly advisor: AdvisorPort;
  readonly assessments: { readonly save: (record: StoredOpportunityAssessment) => void };
  readonly now: () => Date;
}) {
  return {
    async assess(input: {
      readonly opportunity: OpportunityForAssessment;
      readonly policy: AdvisorPolicy;
      readonly signal?: AbortSignal;
    }): Promise<
      | { readonly status: "completed"; readonly assessment: StoredOpportunityAssessment }
      | { readonly status: "disabled" }
      | { readonly status: "rejected"; readonly reason: "unsupported-evidence-reference" }
      | { readonly status: "failed"; readonly message: string }
    > {
      const policy = { ...input.policy };
      const opportunity = structuredClone(input.opportunity);
      if (!policy.enabled) return { status: "disabled" };
      const evidenceCutoff = dependencies.now();
      const executionId = dependencies.history.start({
        kind: "assessment",
        searchProfileId: opportunity.searchProfileId,
        jobListingId: opportunity.jobListingId,
        applicationId: null,
        policy: policy,
        startedAt: evidenceCutoff,
      });
      try {
        if (input.signal?.aborted) throw new Error("Advisor request cancelled.");
        if (!opportunity.description.trim()) {
          throw new Error(
            "This listing has no job description. Open the original listing and refresh it through Discovery before requesting an assessment.",
          );
        }
        const proposal = await dependencies.advisor.assess({
          opportunity: opportunity,
          evidenceCutoff,
          execution: {
            model: policy.model,
            reasoningEffort: policy.reasoningEffort,
            timeoutMs: policy.timeoutMs,
            outputLimit: policy.outputLimit,
            schemaVersion: policy.schemaVersion,
          },
          ...(input.signal ? { signal: input.signal } : {}),
        });
        if (
          input.signal?.aborted ||
          dependencies.now().getTime() - evidenceCutoff.getTime() >= policy.timeoutMs
        ) {
          throw new Error("Advisor request cancelled or timed out.");
        }
        if (!hasSupportedEvidence(proposal, opportunity)) {
          dependencies.history.finish({
            id: executionId,
            status: "rejected",
            reason: "unsupported-evidence-reference",
            finishedAt: dependencies.now(),
          });
          return { status: "rejected", reason: "unsupported-evidence-reference" };
        }
        const assessment = {
          ...proposal,
          searchProfileId: opportunity.searchProfileId,
          jobListingId: opportunity.jobListingId,
          model: policy.model,
          reasoningEffort: policy.reasoningEffort,
          policyVersion: policy.policyVersion,
          schemaVersion: policy.schemaVersion,
          evidenceCutoff,
          createdAt: dependencies.now(),
        };
        dependencies.assessments.save(assessment);
        dependencies.history.finish({
          id: executionId,
          status: "completed",
          reason: null,
          finishedAt: dependencies.now(),
        });
        return { status: "completed", assessment };
      } catch (error) {
        const finishedAt = dependencies.now();
        const status = input.signal?.aborted
          ? "cancelled"
          : finishedAt.getTime() - evidenceCutoff.getTime() >= policy.timeoutMs
            ? "timed-out"
            : "failed";
        dependencies.history.finish({
          id: executionId,
          status,
          reason: status === "failed" ? "advisor-failed" : status,
          finishedAt,
        });
        return {
          status: "failed",
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

function hasSupportedEvidence(
  proposal: OpportunityAssessmentProposal,
  opportunity: OpportunityForAssessment,
): boolean {
  if (proposal.evidence.length === 0) return false;
  const permitted = new Set([opportunity.canonicalUrl, opportunity.applyUrl]);
  const suppliedFacts = new Set([
    opportunity.title,
    opportunity.companyName,
    opportunity.locationText,
  ]);
  if (
    proposal.evidence.some(
      (evidence) =>
        !permitted.has(evidence.sourceUrl) ||
        !evidence.excerpt.trim() ||
        (!suppliedFacts.has(evidence.excerpt) &&
          !opportunity.description.includes(evidence.excerpt)),
    )
  )
    return false;
  const cited = new Set(proposal.evidence.map((evidence) => evidence.sourceUrl));
  return [
    proposal.summary,
    ...proposal.strengths,
    ...proposal.gaps,
    ...proposal.recommendations,
  ].every(
    (recommendation) =>
      recommendation.evidenceUrls.length > 0 &&
      recommendation.evidenceUrls.every((url) => cited.has(url)),
  );
}
