import {
  createResearchRun,
  isTerminalResearchRun,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunScheduler, ResearchRunStore } from "./port";
import type { StartResearchRunResult } from "./start-research-run";

export interface ForRetryingResearchRuns {
  readonly retryResearchRun: (runId: string) => Promise<StartResearchRunResult>;
}

type ResearchRunRetrierDependencies = {
  readonly createId: () => string;
  readonly now: () => Date;
  readonly runs: ResearchRunStore;
  readonly scheduler: ResearchRunScheduler;
};

export function createResearchRunRetrier({
  createId,
  now,
  runs,
  scheduler,
}: ResearchRunRetrierDependencies): ForRetryingResearchRuns {
  return {
    async retryResearchRun(runId) {
      const previous = await runs.get(runId);
      if (!previous || !isTerminalResearchRun(previous)) {
        throw new Error("Only a finished recruiter research run can be retried.");
      }
      const next = createResearchRun({
        id: createId(),
        brief: previous.brief,
        policy: previous.policy,
        retryOfRunId: previous.id,
        sourcePlan: previous.sourcePlan,
        startedAt: now(),
      });
      await runs.create(next);
      scheduler.schedule(next.id);
      return { status: "started", runId: next.id };
    },
  };
}
