export type ResearchCriteria = {
  readonly industries: readonly string[];
  readonly specialisms: readonly string[];
  readonly targetLocations: readonly string[];
};

export type SearchBrief = {
  readonly criteria: ResearchCriteria;
  readonly description: string;
  readonly firmTarget: number;
  readonly recruiterTarget: number;
};

export type AdapterPolicySnapshot = {
  readonly allowedPublicSourceScope: readonly string[];
  readonly authorization: { readonly reference: string; readonly reviewedOn: string };
  readonly disabledBehavior: string;
  readonly enabled: boolean;
  readonly execution: {
    readonly automaticRetry: boolean;
    readonly ephemeral: boolean;
    readonly model: string | null;
    readonly reasoningEffort: string | null;
    readonly sandboxMode: string;
    readonly webSearchEnabled: boolean;
  };
  readonly id: string;
  readonly permittedOperations: readonly string[];
  readonly permittedPublicData: readonly string[];
  readonly rateLimit: {
    readonly stageRequestLimit: number;
    readonly subscriptionExhaustionBehavior: string;
  };
  readonly retention: { readonly deletionRule: string; readonly rule: string };
  readonly version: string;
};

export type ResearchStage = "firms" | "recruiters" | "completed";

export type SourcePlanEntry = {
  readonly adapterId: string;
  readonly allowedPublicSources: readonly string[];
  readonly id: string;
  readonly policyVersion: string;
  readonly stage: Exclude<ResearchStage, "completed">;
};

export type SourcePlanSnapshot = {
  readonly entries: readonly SourcePlanEntry[];
  readonly id: string;
  readonly stageRequestAllowance: Readonly<Record<Exclude<ResearchStage, "completed">, number>>;
  readonly version: string;
};

export type ResearchRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ResearchBudget = {
  readonly firmTarget: number;
  readonly recruiterTarget: number;
  readonly stageRequestAllowance: Readonly<Record<Exclude<ResearchStage, "completed">, number>>;
};

export type ResearchBudgetUsage = Readonly<Record<Exclude<ResearchStage, "completed">, number>>;

export type ResearchBudgetExhaustion = {
  readonly stage: Exclude<ResearchStage, "completed">;
  readonly reason: "stage-request-allowance-reached";
};

export type ResearchRun = {
  readonly id: string;
  readonly retryOfRunId: string | null;
  readonly brief: SearchBrief;
  readonly policy: AdapterPolicySnapshot;
  readonly sourcePlan: SourcePlanSnapshot;
  readonly budget: ResearchBudget;
  readonly budgetUsage: ResearchBudgetUsage;
  readonly budgetExhaustion: ResearchBudgetExhaustion | null;
  readonly status: ResearchRunStatus;
  readonly checkpoint: ResearchStage;
  readonly startedAt: Date;
  readonly updatedAt: Date;
  readonly finishedAt: Date | null;
  readonly completionReason: string | null;
};

export type ResearchSourceFailure = {
  readonly stage: Exclude<ResearchStage, "completed">;
  readonly message: string;
  readonly recordedAt: Date;
};

export type ResearchCoverage = {
  readonly budgetExhaustion: ResearchBudgetExhaustion | null;
  readonly firmTarget: number;
  readonly observedFirmCount: number;
  readonly observedRecruiterCount: number;
  readonly recruiterTarget: number;
  readonly remainingRequests: ResearchBudgetUsage;
  readonly usedRequests: ResearchBudgetUsage;
};

export function createSearchBrief(input: {
  readonly criteria: ResearchCriteria;
  readonly description: string;
  readonly firmTarget: number;
  readonly recruiterTarget: number;
}): SearchBrief {
  if (!Number.isSafeInteger(input.recruiterTarget) || input.recruiterTarget <= 0) {
    throw new Error("Recruiter target must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(input.firmTarget) || input.firmTarget <= 0) {
    throw new Error("Firm target must be a positive safe integer.");
  }
  if (input.firmTarget > input.recruiterTarget) {
    throw new Error("Firm target cannot exceed recruiter target.");
  }
  return {
    criteria: {
      industries: requireCriteria(input.criteria.industries, "Target industries"),
      specialisms: requireCriteria(input.criteria.specialisms, "Technology specialisms"),
      targetLocations: requireCriteria(input.criteria.targetLocations, "Target locations"),
    },
    description: input.description.trim(),
    firmTarget: input.firmTarget,
    recruiterTarget: input.recruiterTarget,
  };
}

export function createResearchRun(input: {
  readonly id: string;
  readonly brief: SearchBrief;
  readonly policy: AdapterPolicySnapshot;
  readonly retryOfRunId?: string;
  readonly sourcePlan: SourcePlanSnapshot;
  readonly startedAt: Date;
}): ResearchRun {
  return {
    id: input.id,
    retryOfRunId: input.retryOfRunId ?? null,
    brief: input.brief,
    policy: input.policy,
    sourcePlan: input.sourcePlan,
    budget: {
      firmTarget: input.brief.firmTarget,
      recruiterTarget: input.brief.recruiterTarget,
      stageRequestAllowance: input.sourcePlan.stageRequestAllowance,
    },
    budgetUsage: { firms: 0, recruiters: 0 },
    budgetExhaustion: null,
    status: "pending",
    checkpoint: "firms",
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    finishedAt: null,
    completionReason: null,
  };
}

export function consumeStageRequest(
  run: ResearchRun,
  stage: Exclude<ResearchStage, "completed">,
  recordedAt: Date,
): ResearchRun {
  if (run.budgetUsage[stage] >= run.budget.stageRequestAllowance[stage]) {
    const completionReason = `The ${stage} stage request allowance is exhausted.`;
    return {
      ...run,
      budgetExhaustion: { stage, reason: "stage-request-allowance-reached" },
      completionReason,
      finishedAt: recordedAt,
      status: stage === "firms" ? "failed" : "partial",
      updatedAt: recordedAt,
    };
  }
  return {
    ...run,
    budgetUsage: { ...run.budgetUsage, [stage]: run.budgetUsage[stage] + 1 },
    updatedAt: recordedAt,
  };
}

export function createResearchCoverage(input: {
  readonly run: ResearchRun;
  readonly observations: readonly { readonly kind: "firm" | "recruiter" }[];
}): ResearchCoverage {
  return {
    budgetExhaustion: input.run.budgetExhaustion,
    firmTarget: input.run.budget.firmTarget,
    observedFirmCount: input.observations.filter((observation) => observation.kind === "firm")
      .length,
    observedRecruiterCount: input.observations.filter(
      (observation) => observation.kind === "recruiter",
    ).length,
    recruiterTarget: input.run.budget.recruiterTarget,
    remainingRequests: {
      firms: Math.max(
        0,
        input.run.budget.stageRequestAllowance.firms - input.run.budgetUsage.firms,
      ),
      recruiters: Math.max(
        0,
        input.run.budget.stageRequestAllowance.recruiters - input.run.budgetUsage.recruiters,
      ),
    },
    usedRequests: input.run.budgetUsage,
  };
}

export function cancelResearchRun(run: ResearchRun, cancelledAt: Date): ResearchRun {
  if (isTerminalResearchRun(run)) {
    return run;
  }
  return {
    ...run,
    status: "cancelled",
    updatedAt: cancelledAt,
    finishedAt: cancelledAt,
    completionReason: "Cancelled by the user before the next source result was accepted.",
  };
}

export function isTerminalResearchRun(run: ResearchRun): boolean {
  return ["completed", "partial", "failed", "cancelled"].includes(run.status);
}

export function isRunAcceptingObservations(run: ResearchRun): boolean {
  return run.status === "pending" || run.status === "running" || run.status === "interrupted";
}

function requireCriteria(values: readonly string[], label: string): readonly string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error(`${label} must contain at least one value.`);
  }
  return [...new Set(cleaned)];
}
