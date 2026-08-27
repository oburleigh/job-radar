import type { ResearchObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  ResearchRun,
  ResearchSourceFailure,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  createResearchCoverage,
  type ResearchCoverage,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunStore } from "./port";

export type ResearchRunDetail = {
  readonly coverage: ResearchCoverage;
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
};

export interface ForGettingResearchRuns {
  readonly getResearchRun: (runId: string) => Promise<ResearchRunDetail | undefined>;
}

export function createResearchRunGetter({
  runs,
}: {
  readonly runs: ResearchRunStore;
}): ForGettingResearchRuns {
  return {
    async getResearchRun(runId) {
      const run = await runs.get(runId);
      if (!run) {
        return undefined;
      }
      const [observations, failures] = await Promise.all([
        runs.observationsFor(runId),
        runs.failuresFor(runId),
      ]);
      return {
        coverage: createResearchCoverage({ run, observations }),
        run,
        observations,
        failures,
      };
    },
  };
}
