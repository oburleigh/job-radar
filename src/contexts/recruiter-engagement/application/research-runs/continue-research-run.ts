import { continueResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunScheduler, ResearchRunStore } from "./port";
import type { StartResearchRunResult } from "./start-research-run";

export interface ForContinuingResearchRuns {
  readonly continueResearchRun: (runId: string) => Promise<StartResearchRunResult>;
}

type ResearchRunContinuerDependencies = {
  readonly createId: () => string;
  readonly now: () => Date;
  readonly runs: ResearchRunStore;
  readonly scheduler: ResearchRunScheduler;
};

export function createResearchRunContinuer({
  createId,
  now,
  runs,
  scheduler,
}: ResearchRunContinuerDependencies): ForContinuingResearchRuns {
  return {
    async continueResearchRun(runId) {
      const previous = await runs.get(runId);
      if (!previous) {
        throw new Error("Only a finished recruiter research run can be continued.");
      }
      const next = continueResearchRun({ id: createId(), previous, startedAt: now() });
      await runs.createContinuation(next, previous.id);
      scheduler.schedule(next.id);
      return { status: "started", runId: next.id };
    },
  };
}
