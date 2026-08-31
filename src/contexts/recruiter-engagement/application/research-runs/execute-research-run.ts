import type { ForMaintainingRecruiterDirectory } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { assessFirmQualification } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import {
  isRunAcceptingObservations,
  type ResearchRun,
} from "@/contexts/recruiter-engagement/domain/research-run";
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
          if (remainingStageRequests(run, "firms") === 0) {
            await reserveRequest("firms")();
            return;
          }
          const firms = await source.findFirms({
            reserveRequest: reserveRequest("firms"),
            run,
            ...(signal ? { signal } : {}),
          });
          if (signal?.aborted || !canAcceptStageResult(run, "firms")) {
            return;
          }
          const recordedAt = now();
          await directory.reconcile({ observations: firms, recordedAt, runId: run.id });
          const updated = await runs.acceptStage(run.id, "firms", firms, recordedAt);
          if (!updated) {
            return;
          }
          run = updated;
          if (!isRunAcceptingObservations(run)) return;
        }

        if (run.checkpoint === "recruiters") {
          if (remainingStageRequests(run, "recruiters") === 0) {
            await reserveRequest("recruiters")();
            return;
          }
          const observedFirms = (await runs.observationsFor(run.id)).filter(
            (observation): observation is FirmObservation => observation.kind === "firm",
          );
          const qualificationAt = now();
          const brief = run.brief;
          const firms = observedFirms.filter(
            (firm) => assessFirmQualification(firm, brief, qualificationAt).qualified,
          );
          const recruiters = await source.findRecruiters({
            run,
            firms,
            reserveRequest: reserveRequest("recruiters"),
            ...(signal ? { signal } : {}),
          });
          if (signal?.aborted || !canAcceptStageResult(run, "recruiters")) {
            return;
          }
          const recordedAt = now();
          await directory.reconcile({ observations: recruiters, recordedAt, runId: run.id });
          const updated = await runs.acceptStage(run.id, "recruiters", recruiters, recordedAt);
          if (!updated) {
            return;
          }
          run = updated;
          if (!isRunAcceptingObservations(run)) return;
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

      function reserveRequest(stage: "firms" | "recruiters") {
        return async () => {
          const reserved = await runs.reserveStageRequest(runId, stage, now());
          if (!reserved) return false;
          run = reserved;
          return isRunAcceptingObservations(reserved);
        };
      }
    },
  };
}

function remainingStageRequests(run: ResearchRun, stage: "firms" | "recruiters"): number {
  return Math.max(0, run.budget.stageRequestAllowance[stage] - run.budgetUsage[stage]);
}

function canAcceptStageResult(run: ResearchRun, stage: "firms" | "recruiters"): boolean {
  return isRunAcceptingObservations(run) || run.budgetExhaustion?.stage === stage;
}
