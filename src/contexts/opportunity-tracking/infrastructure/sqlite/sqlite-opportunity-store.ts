import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type {
  ApplicationRecord,
  OpportunityStore,
  StartApplicationCommand,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { changeApplicationStage } from "@/contexts/opportunity-tracking/domain/application-lifecycle";
import { changeNextAction } from "@/contexts/opportunity-tracking/domain/next-action-lifecycle";
import type * as schema from "@/contexts/opportunity-tracking/infrastructure/sqlite/schema";
import {
  applicationRecommendations,
  applications,
  applicationTimeline,
  nextActions,
} from "@/contexts/opportunity-tracking/infrastructure/sqlite/schema";

type Database = BetterSQLite3Database<typeof schema>;

export function createSqliteOpportunityStore(database: Database): OpportunityStore {
  return {
    startApplication(command, startedAt) {
      return database.transaction((transaction) => {
        const existing = findApplication(transaction, command);
        if (existing) return { status: "existing" as const, application: existing };

        const application = transaction
          .insert(applications)
          .values({
            searchProfileId: command.searchProfileId,
            jobListingId: command.jobListingId,
            stage: command.stage,
            createdAt: startedAt,
            updatedAt: startedAt,
          })
          .returning()
          .get();
        transaction
          .insert(applicationTimeline)
          .values({
            applicationId: application.id,
            kind: "application-started",
            stage: command.stage,
            occurredAt: startedAt,
          })
          .run();
        transaction
          .insert(nextActions)
          .values({
            applicationId: application.id,
            title: command.nextAction.title,
            reason: command.nextAction.reason,
            dueAt: null,
            createdAt: startedAt,
            updatedAt: startedAt,
          })
          .run();
        return { status: "created" as const, application };
      });
    },
    createNextAction(command, createdAt) {
      return database.transaction((transaction) => {
        const application = findApplicationById(transaction, command.applicationId);
        if (!application) return { status: "application-not-found" as const };
        const action = transaction
          .insert(nextActions)
          .values({
            applicationId: application.id,
            title: command.title,
            reason: command.reason,
            dueAt: command.dueAt ?? null,
            createdAt,
            updatedAt: createdAt,
          })
          .returning()
          .get();
        transaction
          .insert(applicationTimeline)
          .values({
            applicationId: application.id,
            kind: "next-action-created",
            nextActionId: action.id,
            stage: application.stage,
            occurredAt: createdAt,
          })
          .run();
        return { status: "created" as const, action };
      });
    },
    changeApplicationStage(command, changedAt) {
      return database.transaction((transaction) => {
        const application = findApplicationById(transaction, command.applicationId);
        if (!application) return { status: "application-not-found" as const };
        const change = changeApplicationStage(application.stage, command.stage, command.intent);
        if (!change.accepted) {
          return { status: "rejected" as const, reason: change.reason };
        }
        transaction
          .update(applications)
          .set({ stage: change.stage, updatedAt: changedAt })
          .where(eq(applications.id, application.id))
          .run();
        transaction
          .insert(applicationTimeline)
          .values({
            applicationId: application.id,
            kind: change.entryKind,
            stage: change.stage,
            occurredAt: changedAt,
          })
          .run();
        return { status: "changed" as const, stage: change.stage };
      });
    },
    changeNextAction(command, changedAt) {
      return database.transaction((transaction) => {
        const action = transaction
          .select()
          .from(nextActions)
          .where(eq(nextActions.id, command.actionId))
          .get();
        if (!action) return { status: "next-action-not-found" as const };
        const change = changeNextAction(
          { state: action.state, dueAt: action.dueAt },
          command.change,
        );
        if (!change.accepted) return { status: "rejected" as const, reason: change.reason };
        transaction
          .update(nextActions)
          .set({ state: change.state, dueAt: change.dueAt, updatedAt: changedAt })
          .where(eq(nextActions.id, action.id))
          .run();
        const application = findApplicationById(transaction, action.applicationId);
        if (!application) throw new Error("Next action references a missing Application");
        transaction
          .insert(applicationTimeline)
          .values({
            applicationId: application.id,
            kind: nextActionTimelineKind(command.change.kind),
            nextActionId: action.id,
            stage: application.stage,
            occurredAt: changedAt,
          })
          .run();
        return { status: "changed" as const, state: change.state };
      });
    },
    listApplications() {
      return database
        .select()
        .from(applications)
        .orderBy(asc(applications.createdAt), asc(applications.id))
        .all();
    },
    listTimeline(applicationId) {
      return database
        .select()
        .from(applicationTimeline)
        .where(eq(applicationTimeline.applicationId, applicationId))
        .orderBy(asc(applicationTimeline.occurredAt), asc(applicationTimeline.id))
        .all();
    },
    listOpenActions() {
      return database
        .select({
          id: nextActions.id,
          applicationId: nextActions.applicationId,
          title: nextActions.title,
          reason: nextActions.reason,
          dueAt: nextActions.dueAt,
          createdAt: nextActions.createdAt,
        })
        .from(nextActions)
        .where(eq(nextActions.state, "open"))
        .all();
    },
    listApplicationActions(applicationId) {
      return database
        .select()
        .from(nextActions)
        .where(eq(nextActions.applicationId, applicationId))
        .orderBy(asc(nextActions.createdAt), asc(nextActions.id))
        .all();
    },
    listApplicationRecommendations(applicationId) {
      return database
        .select()
        .from(applicationRecommendations)
        .where(eq(applicationRecommendations.applicationId, applicationId))
        .orderBy(asc(applicationRecommendations.createdAt), asc(applicationRecommendations.id))
        .all();
    },
    acceptRecommendation(command, acceptedAt) {
      return database.transaction((transaction) => {
        const recommendation = transaction
          .select()
          .from(applicationRecommendations)
          .where(
            and(
              eq(applicationRecommendations.id, command.recommendationId),
              eq(applicationRecommendations.applicationId, command.applicationId),
            ),
          )
          .get();
        if (!recommendation) return { status: "recommendation-not-found" as const };
        if (recommendation.state !== "proposed") {
          return { status: "recommendation-already-decided" as const };
        }
        const application = findApplicationById(transaction, command.applicationId);
        if (!application) return { status: "recommendation-not-found" as const };
        const action = transaction
          .insert(nextActions)
          .values({
            applicationId: application.id,
            title: recommendation.title,
            reason: recommendation.reason,
            dueAt: command.dueAt ?? null,
            createdAt: acceptedAt,
            updatedAt: acceptedAt,
          })
          .returning()
          .get();
        transaction
          .insert(applicationTimeline)
          .values({
            applicationId: application.id,
            kind: "next-action-created",
            nextActionId: action.id,
            stage: application.stage,
            occurredAt: acceptedAt,
          })
          .run();
        transaction
          .update(applicationRecommendations)
          .set({
            state: "accepted",
            acceptedNextActionId: action.id,
            updatedAt: acceptedAt,
          })
          .where(eq(applicationRecommendations.id, recommendation.id))
          .run();
        return { status: "accepted" as const, action };
      });
    },
    dismissRecommendation(command, dismissedAt) {
      return database.transaction((transaction) => {
        const recommendation = transaction
          .select()
          .from(applicationRecommendations)
          .where(
            and(
              eq(applicationRecommendations.id, command.recommendationId),
              eq(applicationRecommendations.applicationId, command.applicationId),
            ),
          )
          .get();
        if (!recommendation) return { status: "recommendation-not-found" as const };
        if (recommendation.state !== "proposed") {
          return { status: "recommendation-already-decided" as const };
        }
        transaction
          .update(applicationRecommendations)
          .set({ state: "dismissed", updatedAt: dismissedAt })
          .where(
            and(
              eq(applicationRecommendations.id, recommendation.id),
              eq(applicationRecommendations.applicationId, command.applicationId),
            ),
          )
          .run();
        return { status: "dismissed" as const };
      });
    },
  };
}

const nextActionTimelineKinds = {
  complete: "next-action-completed",
  defer: "next-action-deferred",
  dismiss: "next-action-dismissed",
  reopen: "next-action-reopened",
} as const;

function nextActionTimelineKind(kind: keyof typeof nextActionTimelineKinds) {
  return nextActionTimelineKinds[kind];
}

function findApplicationById(
  database: Database,
  applicationId: number,
): ApplicationRecord | undefined {
  return database.select().from(applications).where(eq(applications.id, applicationId)).get();
}

function findApplication(
  database: Database,
  command: Pick<StartApplicationCommand, "searchProfileId" | "jobListingId">,
): ApplicationRecord | undefined {
  return database
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.searchProfileId, command.searchProfileId),
        eq(applications.jobListingId, command.jobListingId),
      ),
    )
    .get();
}
