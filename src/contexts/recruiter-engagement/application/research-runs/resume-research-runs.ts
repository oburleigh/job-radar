import type { ResearchRunScheduler, ResearchRunStore } from "./port";

export interface ForResumingResearchRuns {
  readonly resumeResearchRuns: () => Promise<void>;
}

type ResearchRunResumerDependencies = {
  readonly runs: ResearchRunStore;
  readonly scheduler: ResearchRunScheduler;
};

export function createResearchRunResumer({
  runs,
  scheduler,
}: ResearchRunResumerDependencies): ForResumingResearchRuns {
  return {
    async resumeResearchRuns() {
      for (const run of await runs.listResumable()) {
        scheduler.schedule(run.id);
      }
    },
  };
}
