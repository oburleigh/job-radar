import type {
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";

import type { ResearchSource } from "./port";

export interface ResearchSourceFailureRecorder {
  readonly record: (failure: {
    readonly adapterId: string;
    readonly message: string;
    readonly recordedAt: Date;
    readonly runId: string;
    readonly stage: "firms" | "recruiters";
  }) => Promise<void>;
}

type ResearchSourceSetDependencies = {
  readonly failures: ResearchSourceFailureRecorder;
  readonly now: () => Date;
  readonly sources: readonly ResearchSource[];
};

export function createResearchSourceSet({
  failures,
  now,
  sources,
}: ResearchSourceSetDependencies): ResearchSource {
  return {
    adapterId: "research-source-set",
    assess(run) {
      const assessments = sources.map((source) => source.assess(run));
      if (assessments.some((assessment) => assessment.available)) return { available: true };
      return {
        available: false,
        message:
          assessments.find((assessment) => !assessment.available)?.message ??
          "No recruiter Source is configured.",
      };
    },
    async findFirms({ run, signal }) {
      const results: FirmObservation[] = [];
      let attempted = 0;
      let succeeded = 0;
      for (const source of permittedSources(sources, run)) {
        attempted += 1;
        try {
          results.push(...(await source.findFirms({ run, ...(signal ? { signal } : {}) })));
          succeeded += 1;
        } catch (error) {
          await failures.record({
            adapterId: source.adapterId,
            message: errorMessage(error),
            recordedAt: now(),
            runId: run.id,
            stage: "firms",
          });
        }
      }
      if (attempted > 0 && succeeded === 0) {
        throw new Error("Every permitted Source failed during the firms stage.");
      }
      return results;
    },
    async findRecruiters({ run, firms, signal }) {
      const results: RecruiterObservation[] = [];
      let attempted = 0;
      let succeeded = 0;
      for (const source of permittedSources(sources, run)) {
        attempted += 1;
        try {
          results.push(
            ...(await source.findRecruiters({
              firms,
              run,
              ...(signal ? { signal } : {}),
            })),
          );
          succeeded += 1;
        } catch (error) {
          await failures.record({
            adapterId: source.adapterId,
            message: errorMessage(error),
            recordedAt: now(),
            runId: run.id,
            stage: "recruiters",
          });
        }
      }
      if (attempted > 0 && succeeded === 0) {
        throw new Error("Every permitted Source failed during the recruiters stage.");
      }
      return results;
    },
  };
}

function permittedSources(
  sources: readonly ResearchSource[],
  run: ResearchRun,
): readonly ResearchSource[] {
  return sources.filter((source) => source.assess(run).available);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
