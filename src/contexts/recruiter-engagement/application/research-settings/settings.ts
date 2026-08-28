import {
  createSearchBrief,
  type ResearchCriteria,
  type SearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";

export type RecruiterResearchSettings = {
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

export function searchBriefFromSettings(
  settings: RecruiterResearchSettings,
  targetLocations: readonly string[],
): SearchBrief {
  return createSearchBrief({
    criteria: { ...settings.defaultBrief.criteria, targetLocations },
    description: settings.defaultBrief.description,
    firmTarget: settings.defaultBrief.firmTarget,
    recruiterTarget: settings.defaultBrief.recruiterTarget,
  });
}
