import type { RecruiterResearchSettings } from "./settings";

export type ResearchCriteriaOptionsCommand = RecruiterResearchSettings["criteriaOptions"];

export interface ResearchCriteriaOptionsStore {
  readonly replaceResearchCriteriaOptions: (
    options: ResearchCriteriaOptionsCommand,
    changedAt: Date,
  ) => void;
}

export function createSaveResearchCriteriaOptions(input: {
  readonly now: () => Date;
  readonly settings: ResearchCriteriaOptionsStore;
}) {
  return (command: ResearchCriteriaOptionsCommand) => {
    input.settings.replaceResearchCriteriaOptions(command, input.now());
    return { status: "saved" as const };
  };
}
