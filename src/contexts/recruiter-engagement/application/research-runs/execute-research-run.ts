import type { ForMaintainingRecruiterDirectory } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { isRunAcceptingObservations } from "@/contexts/recruiter-engagement/domain/research-run";
import type { ResearchRunStore, ResearchSource } from "./port";

export interface ForExecutingResearchRuns {
  readonly executeResearchRun: (runId: string, signal?: AbortSignal) => Promise<void>;
}

type ResearchRunExecutionDependencies = {
  readonly directory: Pick<ForMaintainingRecruiterDirectory, "reconcile">;
  readonly now: () => Date;
  readonly runs: ResearchRunStore;
  readonly source: ResearchSource;
};

export function createResearchRunExecution({
  directory,
  now,
  runs,
  source,
}: ResearchRunExecutionDependencies): ForExecutingResearchRuns {
  return {
    async executeResearchRun(runId, signal) {
      if (signal?.aborted) {
        return;
      }
      let run = await runs.begin(runId, now());
      if (!run || !isRunAcceptingObservations(run)) {
        return;
      }

      const eligibility = source.assess(run);
      if (!eligibility.available) {
        await runs.fail(run.id, eligibility.message, now());
        return;
      }

      try {
        if (run.checkpoint === "firms") {
          const reserved = await runs.reserveStageRequest(run.id, "firms", now());
          if (!reserved || !isRunAcceptingObservations(reserved)) {
            return;
          }
          run = reserved;
          const firms = await source.findFirms({ run, ...(signal ? { signal } : {}) });
          if (signal?.aborted) {
            return;
          }
          const recordedAt = now();
          await directory.reconcile({ observations: firms, recordedAt, runId: run.id });
          const updated = await runs.acceptStage(run.id, "firms", firms, recordedAt);
          if (!updated) {
            return;
          }
          run = updated;
        }

        if (run.checkpoint === "recruiters") {
          const firms = (await runs.observationsFor(run.id)).filter(
            (observation): observation is FirmObservation => observation.kind === "firm",
          );
          const reserved = await runs.reserveStageRequest(run.id, "recruiters", now());
          if (!reserved || !isRunAcceptingObservations(reserved)) {
            return;
          }
          run = reserved;
          const recruiters = await source.findRecruiters({
            run,
            firms,
            ...(signal ? { signal } : {}),
          });
          if (signal?.aborted) {
            return;
          }
          const recordedAt = now();
          await directory.reconcile({ observations: recruiters, recordedAt, runId: run.id });
          const updated = await runs.acceptStage(run.id, "recruiters", recruiters, recordedAt);
          if (!updated) {
            return;
          }
          run = updated;
        }

        if (run.checkpoint === "completed") {
          await runs.complete(run.id, now());
        }
      } catch (error) {
        const latest = await runs.get(runId);
        if (!latest || !isRunAcceptingObservations(latest)) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await runs.fail(runId, message, now());
      }
    },
  };
}
