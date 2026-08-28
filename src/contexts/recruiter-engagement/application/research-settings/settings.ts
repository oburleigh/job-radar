import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type { ResearchCriteria } from "@/contexts/recruiter-engagement/domain/research-run";

export type RecruiterResearchSettings = {
  readonly directoryMatchWeights: DirectoryMatchWeights;
  readonly defaultBrief: {
    readonly criteria: Omit<ResearchCriteria, "targetLocations">;
    readonly description: string;
    readonly firmTarget: number;
    readonly recruiterTarget: number;
  };
  readonly execution: {
    readonly model: string | null;
    readonly reasoningEffort: string | null;
    readonly stageRequestLimit: number;
    readonly stageTimeoutMs: number;
  };
};
