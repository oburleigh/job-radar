import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunStore } from "./port";

export interface ResearchRunActivityReader {
  readonly listResearchRuns: () => Promise<readonly ResearchRun[]>;
}

export function createResearchRunActivityReader(input: {
  readonly runs: ResearchRunStore;
}): ResearchRunActivityReader {
  return {
    listResearchRuns: () => input.runs.listAll(),
  };
}
