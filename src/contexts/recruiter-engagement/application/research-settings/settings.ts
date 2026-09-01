import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type {
  PublicResearchQueryPolicy,
  ResearchCriteria,
} from "@/contexts/recruiter-engagement/domain/research-run";

export type ResearchReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ResearchExecutionSettings = {
  readonly model: string;
  readonly reasoningEffort: ResearchReasoningEffort;
  readonly stageRequestLimit: number;
  readonly stageTimeoutMs: number;
};

export type RecruiterResearchSettings = {
  readonly criteriaOptions: Omit<ResearchCriteria, "targetLocations">;
  readonly execution: ResearchExecutionSettings;
  readonly directoryMatchWeights: DirectoryMatchWeights;
  readonly defaultBrief: {
    readonly criteria: Omit<ResearchCriteria, "targetLocations">;
    readonly description: string;
    readonly firmTarget: number;
    readonly recruiterTarget: number;
  };
  readonly publicSearch: PublicResearchQueryPolicy & {
    readonly providerName: string;
    readonly stageRequestLimit: number;
  };
};
