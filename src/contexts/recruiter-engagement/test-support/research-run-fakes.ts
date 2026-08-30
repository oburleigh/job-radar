import type {
  ResearchRunScheduler,
  ResearchRunStore,
  ResearchSource,
} from "@/contexts/recruiter-engagement/application/research-runs/port";
import type {
  FirmObservation,
  RecruiterObservation,
  ResearchObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import { observationIdentity } from "@/contexts/recruiter-engagement/domain/observation";
import {
  cancelResearchRun,
  consumeStageRequest,
  isRunAcceptingObservations,
  type ResearchRun,
  type ResearchSourceFailure,
} from "@/contexts/recruiter-engagement/domain/research-run";

export function createFakeResearchRunStore(
  initialRuns: readonly ResearchRun[] = [],
): ResearchRunStore & {
  readonly recordedObservationsFor: (runId: string) => readonly ResearchObservation[];
} {
  const runs = new Map(initialRuns.map((run) => [run.id, run]));
  const observations = new Map<string, Map<string, ResearchObservation>>();
  const failures = new Map<string, ResearchSourceFailure[]>();

  function getObservations(runId: string): Map<string, ResearchObservation> {
    const stored = observations.get(runId);
    if (stored) {
      return stored;
    }
    const created = new Map<string, ResearchObservation>();
    observations.set(runId, created);
    return created;
  }

  return {
    async create(run) {
      runs.set(run.id, run);
    },
    get: async (runId) => runs.get(runId),
    async listAll() {
      return [...runs.values()].toSorted(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
      );
    },
    async listResumable() {
      return [...runs.values()].filter(isRunAcceptingObservations);
    },
    async observationsFor(runId) {
      return [...getObservations(runId).values()];
    },
    recordedObservationsFor(runId) {
      return [...getObservations(runId).values()];
    },
    async failuresFor(runId) {
      return failures.get(runId) ?? [];
    },
    async begin(runId, startedAt) {
      const run = runs.get(runId);
      if (!run || !isRunAcceptingObservations(run)) {
        return undefined;
      }
      const updated = { ...run, status: "running" as const, updatedAt: startedAt };
      runs.set(runId, updated);
      return updated;
    },
    async reserveStageRequest(runId, stage, recordedAt) {
      const run = runs.get(runId);
      if (!run || !isRunAcceptingObservations(run) || run.checkpoint !== stage) {
        return undefined;
      }
      const updated = consumeStageRequest(run, stage, recordedAt);
      runs.set(runId, updated);
      return updated;
    },
    async acceptStage(runId, completedStage, accepted, recordedAt) {
      const run = runs.get(runId);
      if (!run || !isRunAcceptingObservations(run) || run.checkpoint !== completedStage) {
        return undefined;
      }
      for (const observation of accepted) {
        getObservations(runId).set(observationIdentity(observation), observation);
      }
      const updated = {
        ...run,
        checkpoint: completedStage === "firms" ? ("recruiters" as const) : ("completed" as const),
        status: "running" as const,
        updatedAt: recordedAt,
      };
      runs.set(runId, updated);
      return updated;
    },
    async complete(runId, finishedAt) {
      const run = runs.get(runId);
      if (!run || !isRunAcceptingObservations(run) || run.checkpoint !== "completed") {
        return undefined;
      }
      const updated = {
        ...run,
        status: "completed" as const,
        updatedAt: finishedAt,
        finishedAt,
        completionReason: "Both source stages completed.",
      };
      runs.set(runId, updated);
      return updated;
    },
    async fail(runId, message, finishedAt) {
      const run = runs.get(runId);
      if (!run || !isRunAcceptingObservations(run)) {
        return undefined;
      }
      const updated = {
        ...run,
        status: run.checkpoint === "firms" ? ("failed" as const) : ("partial" as const),
        updatedAt: finishedAt,
        finishedAt,
        completionReason: message,
      };
      const stage = run.checkpoint === "firms" ? "firms" : "recruiters";
      failures.set(runId, [{ stage, message, recordedAt: finishedAt }]);
      runs.set(runId, updated);
      return updated;
    },
    async cancel(runId, cancelledAt) {
      const run = runs.get(runId);
      if (!run) {
        return undefined;
      }
      const cancelled = cancelResearchRun(run, cancelledAt);
      runs.set(runId, cancelled);
      return cancelled;
    },
  };
}

export function createFakeResearchSource(input: {
  readonly firms: readonly FirmObservation[];
  readonly recruiters: readonly RecruiterObservation[];
}): ResearchSource {
  return {
    assess: () => ({ available: true }),
    findFirms: async () => input.firms,
    findRecruiters: async () => input.recruiters,
  };
}

export function createFakeResearchRunScheduler(): ResearchRunScheduler & {
  readonly cancelledRunIds: readonly string[];
  readonly scheduledRunIds: readonly string[];
} {
  const scheduledRunIds: string[] = [];
  const cancelledRunIds: string[] = [];
  return {
    schedule(runId) {
      scheduledRunIds.push(runId);
    },
    cancel(runId) {
      cancelledRunIds.push(runId);
    },
    get scheduledRunIds() {
      return scheduledRunIds;
    },
    get cancelledRunIds() {
      return cancelledRunIds;
    },
  };
}
