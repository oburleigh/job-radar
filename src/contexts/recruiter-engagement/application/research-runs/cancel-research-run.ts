import type { ResearchRunScheduler, ResearchRunStore } from "./port";

export interface ForCancellingResearchRuns {
  readonly cancelResearchRun: (runId: string) => Promise<void>;
}

type ResearchRunCancellerDependencies = {
  readonly now: () => Date;
  readonly runs: ResearchRunStore;
  readonly scheduler: ResearchRunScheduler;
};

export function createResearchRunCanceller({
  now,
  runs,
  scheduler,
}: ResearchRunCancellerDependencies): ForCancellingResearchRuns {
  return {
    async cancelResearchRun(runId) {
      const cancelled = await runs.cancel(runId, now());
      if (cancelled?.status === "cancelled") {
        scheduler.cancel(runId);
      }
    },
  };
}
