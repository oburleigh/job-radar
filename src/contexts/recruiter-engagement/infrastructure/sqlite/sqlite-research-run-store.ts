import { and, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ResearchRunStore } from "@/contexts/recruiter-engagement/application/research-runs/port";
import { observationIdentity } from "@/contexts/recruiter-engagement/domain/observation";
import {
  cancelResearchRun,
  consumeStageRequest,
  isRunAcceptingObservations,
  type ResearchRun,
  type ResearchStage,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  parsePersistedObservation,
  parsePersistedResearchRun,
  parsePersistedSourceFailure,
} from "./persistence-schema";
import {
  recruiterResearchObservations,
  recruiterResearchRuns,
  recruiterResearchSourceFailures,
} from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export function createSqliteResearchRunStore<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
): ResearchRunStore {
  return {
    async create(run) {
      database
        .insert(recruiterResearchRuns)
        .values({
          id: run.id,
          retryOfRunId: run.retryOfRunId,
          brief: run.brief.description,
          criteria: run.brief.criteria,
          recruiterTarget: run.brief.recruiterTarget,
          policy: run.policy,
          sourcePlan: run.sourcePlan,
          budget: run.budget,
          budgetUsage: run.budgetUsage,
          budgetExhaustion: run.budgetExhaustion,
          status: run.status,
          checkpoint: run.checkpoint,
          completionReason: run.completionReason,
          startedAt: run.startedAt,
          updatedAt: run.updatedAt,
          finishedAt: run.finishedAt,
        })
        .run();
    },
    async get(runId) {
      const row = database
        .select()
        .from(recruiterResearchRuns)
        .where(eq(recruiterResearchRuns.id, runId))
        .get();
      return row ? toResearchRun(row) : undefined;
    },
    async listAll() {
      return database
        .select()
        .from(recruiterResearchRuns)
        .orderBy(desc(recruiterResearchRuns.startedAt))
        .all()
        .map(toResearchRun);
    },
    async listResumable() {
      return database
        .select()
        .from(recruiterResearchRuns)
        .where(inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]))
        .all()
        .map(toResearchRun);
    },
    async observationsFor(runId) {
      return database
        .select({ payload: recruiterResearchObservations.payload })
        .from(recruiterResearchObservations)
        .where(eq(recruiterResearchObservations.runId, runId))
        .orderBy(recruiterResearchObservations.id)
        .all()
        .map((row) => parsePersistedObservation(row.payload));
    },
    async failuresFor(runId) {
      return database
        .select({
          adapterId: recruiterResearchSourceFailures.adapterId,
          stage: recruiterResearchSourceFailures.stage,
          message: recruiterResearchSourceFailures.message,
          recordedAt: recruiterResearchSourceFailures.recordedAt,
        })
        .from(recruiterResearchSourceFailures)
        .where(eq(recruiterResearchSourceFailures.runId, runId))
        .all()
        .map(parsePersistedSourceFailure);
    },
    async begin(runId, startedAt) {
      const current = await this.get(runId);
      if (!current || !isRunAcceptingObservations(current)) {
        return undefined;
      }
      const updated = database
        .update(recruiterResearchRuns)
        .set({ status: "running", updatedAt: startedAt })
        .where(
          and(
            eq(recruiterResearchRuns.id, runId),
            inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
          ),
        )
        .run();
      return updated.changes > 0 ? this.get(runId) : undefined;
    },
    async reserveStageRequest(runId, stage, recordedAt) {
      return database.transaction((transaction) => {
        const current = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        if (!current) {
          return undefined;
        }
        const run = toResearchRun(current);
        if (!isRunAcceptingObservations(run) || run.checkpoint !== stage) {
          return undefined;
        }
        const updated = consumeStageRequest(run, stage, recordedAt);
        const write = transaction
          .update(recruiterResearchRuns)
          .set({
            budgetUsage: updated.budgetUsage,
            budgetExhaustion: updated.budgetExhaustion,
            completionReason: updated.completionReason,
            finishedAt: updated.finishedAt,
            status: updated.status,
            updatedAt: updated.updatedAt,
          })
          .where(
            and(
              eq(recruiterResearchRuns.id, runId),
              eq(recruiterResearchRuns.checkpoint, stage),
              inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
            ),
          )
          .run();
        if (write.changes === 0) {
          return undefined;
        }
        const persisted = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        return persisted ? toResearchRun(persisted) : undefined;
      });
    },
    async acceptStage(runId, completedStage, observations, recordedAt) {
      return database.transaction((transaction) => {
        const current = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        if (!current) {
          return undefined;
        }
        const run = toResearchRun(current);
        const canRetainExhaustedResults = run.budgetExhaustion?.stage === completedStage;
        if (
          (!isRunAcceptingObservations(run) && !canRetainExhaustedResults) ||
          run.checkpoint !== completedStage
        ) {
          return undefined;
        }

        for (const observation of observations) {
          transaction
            .insert(recruiterResearchObservations)
            .values({
              runId,
              identity: observationIdentity(observation),
              kind: observation.kind,
              payload: observation,
              recordedAt,
            })
            .onConflictDoNothing()
            .run();
        }

        if (canRetainExhaustedResults) return run;

        const checkpoint: ResearchStage = completedStage === "firms" ? "recruiters" : "completed";
        const updated = transaction
          .update(recruiterResearchRuns)
          .set({ checkpoint, status: "running", updatedAt: recordedAt })
          .where(
            and(
              eq(recruiterResearchRuns.id, runId),
              eq(recruiterResearchRuns.checkpoint, completedStage),
              inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
            ),
          )
          .run();
        if (updated.changes === 0) {
          return undefined;
        }
        const persisted = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        return persisted ? toResearchRun(persisted) : undefined;
      });
    },
    async complete(runId, finishedAt) {
      const updated = database
        .update(recruiterResearchRuns)
        .set({
          status: "completed",
          completionReason: "Both source stages completed.",
          updatedAt: finishedAt,
          finishedAt,
        })
        .where(
          and(
            eq(recruiterResearchRuns.id, runId),
            eq(recruiterResearchRuns.checkpoint, "completed"),
            inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
          ),
        )
        .run();
      return updated.changes > 0 ? this.get(runId) : undefined;
    },
    async fail(runId, message, finishedAt) {
      return database.transaction((transaction) => {
        const current = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        if (!current) {
          return undefined;
        }
        const run = toResearchRun(current);
        if (!isRunAcceptingObservations(run)) {
          return undefined;
        }
        const stage = run.checkpoint === "firms" ? "firms" : "recruiters";
        transaction
          .insert(recruiterResearchSourceFailures)
          .values({ adapterId: null, runId, stage, message, recordedAt: finishedAt })
          .onConflictDoUpdate({
            target: [
              recruiterResearchSourceFailures.runId,
              recruiterResearchSourceFailures.stage,
              recruiterResearchSourceFailures.adapterId,
            ],
            set: { message, recordedAt: finishedAt },
          })
          .run();
        const status = stage === "firms" ? "failed" : "partial";
        const updated = transaction
          .update(recruiterResearchRuns)
          .set({ status, completionReason: message, updatedAt: finishedAt, finishedAt })
          .where(
            and(
              eq(recruiterResearchRuns.id, runId),
              inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
            ),
          )
          .run();
        if (updated.changes === 0) {
          return undefined;
        }
        const persisted = transaction
          .select()
          .from(recruiterResearchRuns)
          .where(eq(recruiterResearchRuns.id, runId))
          .get();
        return persisted ? toResearchRun(persisted) : undefined;
      });
    },
    async recordSourceFailure(runId, failure) {
      database
        .insert(recruiterResearchSourceFailures)
        .values({ runId, ...failure })
        .onConflictDoUpdate({
          target: [
            recruiterResearchSourceFailures.runId,
            recruiterResearchSourceFailures.stage,
            recruiterResearchSourceFailures.adapterId,
          ],
          set: { message: failure.message, recordedAt: failure.recordedAt },
        })
        .run();
    },
    async cancel(runId, cancelledAt) {
      const current = await this.get(runId);
      if (!current) {
        return undefined;
      }
      const cancelled = cancelResearchRun(current, cancelledAt);
      if (cancelled === current) {
        return current;
      }
      const updated = database
        .update(recruiterResearchRuns)
        .set({
          status: cancelled.status,
          completionReason: cancelled.completionReason,
          updatedAt: cancelled.updatedAt,
          finishedAt: cancelled.finishedAt,
        })
        .where(
          and(
            eq(recruiterResearchRuns.id, runId),
            inArray(recruiterResearchRuns.status, ["pending", "running", "interrupted"]),
          ),
        )
        .run();
      return updated.changes > 0 ? this.get(runId) : undefined;
    },
  };
}

function toResearchRun(row: typeof recruiterResearchRuns.$inferSelect): ResearchRun {
  return parsePersistedResearchRun({
    id: row.id,
    retryOfRunId: row.retryOfRunId,
    brief: {
      criteria: row.criteria,
      description: row.brief,
      recruiterTarget: row.recruiterTarget,
    },
    policy: row.policy,
    sourcePlan: row.sourcePlan,
    budget: row.budget,
    budgetUsage: row.budgetUsage,
    budgetExhaustion: row.budgetExhaustion,
    status: row.status,
    checkpoint: row.checkpoint,
    completionReason: row.completionReason,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
  });
}
