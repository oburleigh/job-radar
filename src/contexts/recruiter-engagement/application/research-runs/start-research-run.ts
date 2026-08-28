import {
  type AdapterPolicySnapshot,
  createResearchRun,
  createSearchBrief,
  type ResearchCriteria,
  type SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunScheduler, ResearchRunStore } from "./port";

export type StartResearchRunResult = { readonly status: "started"; readonly runId: string };

export interface ForStartingResearchRuns {
  readonly startResearchRun: (command: {
    readonly brief: string;
    readonly criteria: ResearchCriteria;
    readonly firmTarget: number;
    readonly recruiterTarget: number;
  }) => Promise<StartResearchRunResult>;
}

type ResearchRunStarterDependencies = {
  readonly createId: () => string;
  readonly now: () => Date;
  readonly policy: AdapterPolicySnapshot;
  readonly runs: ResearchRunStore;
  readonly scheduler: ResearchRunScheduler;
  readonly sourcePlan: SourcePlanSnapshot;
};

export function createResearchRunStarter({
  createId,
  now,
  policy,
  runs,
  scheduler,
  sourcePlan,
}: ResearchRunStarterDependencies): ForStartingResearchRuns {
  return {
    async startResearchRun(command) {
      const startedAt = now();
      const run = createResearchRun({
        id: createId(),
        brief: createSearchBrief({
          description: command.brief,
          criteria: command.criteria,
          firmTarget: command.firmTarget,
          recruiterTarget: command.recruiterTarget,
        }),
        policy,
        sourcePlan,
        startedAt,
      });
      await runs.create(run);
      scheduler.schedule(run.id);
      return { status: "started", runId: run.id };
    },
  };
}
