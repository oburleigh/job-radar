import {
  APPLICATION_STAGES,
  type ApplicationStage,
} from "@/contexts/opportunity-tracking/domain/application-stage";
import type {
  NextActionChange,
  NextActionState,
} from "@/contexts/opportunity-tracking/domain/next-action-lifecycle";

export interface ApplicationRecord {
  readonly id: number;
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly stage: ApplicationStage;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TimelineEntry {
  readonly id: number;
  readonly applicationId: number;
  readonly nextActionId: number | null;
  readonly kind:
    | "application-migrated"
    | "application-started"
    | "stage-changed"
    | "stage-corrected"
    | "next-action-created"
    | "next-action-completed"
    | "next-action-deferred"
    | "next-action-dismissed"
    | "next-action-reopened";
  readonly stage: ApplicationStage;
  readonly occurredAt: Date;
}

export interface TodayAction {
  readonly id: number;
  readonly applicationId: number;
  readonly title: string;
  readonly reason: string;
  readonly dueAt: Date | null;
}

export interface StoredNextAction extends TodayAction {
  readonly createdAt: Date;
}

export interface ApplicationNextAction extends StoredNextAction {
  readonly state: NextActionState;
}

export interface ApplicationRecommendation {
  readonly id: number;
  readonly applicationId: number;
  readonly sourceKind: "relationship-plan";
  readonly sourceRecordId: number;
  readonly title: string;
  readonly reason: string;
  readonly evidenceUrls: readonly string[];
  readonly state: "proposed" | "accepted" | "dismissed";
  readonly acceptedNextActionId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StartApplicationCommand {
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly stage: Extract<ApplicationStage, "preparing" | "applied">;
}

export interface StoreApplicationStartCommand extends StartApplicationCommand {
  readonly nextAction: {
    readonly title: string;
    readonly reason: string;
  };
}

export type StartApplicationResult =
  | { readonly status: "created"; readonly application: ApplicationRecord }
  | { readonly status: "existing"; readonly application: ApplicationRecord }
  | { readonly status: "opportunity-not-found" };

export interface CreateNextActionCommand {
  readonly applicationId: number;
  readonly title: string;
  readonly reason: string;
  readonly dueAt?: Date;
}

export type CreateNextActionResult =
  | { readonly status: "created"; readonly action: ApplicationNextAction }
  | { readonly status: "application-not-found" };

export interface ChangeApplicationStageCommand {
  readonly applicationId: number;
  readonly stage: ApplicationStage;
  readonly intent: "advance" | "correction";
}

export type ChangeApplicationStageResult =
  | { readonly status: "changed"; readonly stage: ApplicationStage }
  | {
      readonly status: "rejected";
      readonly reason: "invalid-stage-transition" | "stage-unchanged";
    }
  | { readonly status: "application-not-found" };

export interface ChangeNextActionCommand {
  readonly actionId: number;
  readonly change: NextActionChange;
}

export type ChangeNextActionResult =
  | { readonly status: "changed"; readonly state: NextActionState }
  | { readonly status: "rejected"; readonly reason: "invalid-next-action-change" }
  | { readonly status: "next-action-not-found" };

export interface AcceptRecommendationCommand {
  readonly applicationId: number;
  readonly recommendationId: number;
  readonly dueAt?: Date;
}

export type AcceptRecommendationResult =
  | { readonly status: "accepted"; readonly action: ApplicationNextAction }
  | { readonly status: "recommendation-not-found" | "recommendation-already-decided" };

export interface DismissRecommendationCommand {
  readonly applicationId: number;
  readonly recommendationId: number;
}

export type DismissRecommendationResult =
  | { readonly status: "dismissed" }
  | { readonly status: "recommendation-not-found" | "recommendation-already-decided" };

export interface RankedOpportunityReader {
  findRankedOpportunity(reference: {
    readonly searchProfileId: number;
    readonly jobListingId: number;
  }): { readonly searchProfileId: number; readonly jobListingId: number } | null;
}

export interface OpportunityStore {
  startApplication(
    command: StoreApplicationStartCommand,
    startedAt: Date,
  ): Exclude<StartApplicationResult, { readonly status: "opportunity-not-found" }>;
  createNextAction(command: CreateNextActionCommand, createdAt: Date): CreateNextActionResult;
  changeApplicationStage(
    command: ChangeApplicationStageCommand,
    changedAt: Date,
  ): ChangeApplicationStageResult;
  changeNextAction(command: ChangeNextActionCommand, changedAt: Date): ChangeNextActionResult;
  listApplications(): readonly ApplicationRecord[];
  listTimeline(applicationId: number): readonly TimelineEntry[];
  listOpenActions(): readonly StoredNextAction[];
  listApplicationActions(applicationId: number): readonly ApplicationNextAction[];
  listApplicationRecommendations(applicationId: number): readonly ApplicationRecommendation[];
  acceptRecommendation(
    command: AcceptRecommendationCommand,
    acceptedAt: Date,
  ): AcceptRecommendationResult;
  dismissRecommendation(
    command: DismissRecommendationCommand,
    dismissedAt: Date,
  ): DismissRecommendationResult;
}

export function createOpportunityWorkflow(dependencies: {
  readonly now: () => Date;
  readonly opportunities: RankedOpportunityReader;
  readonly store: OpportunityStore;
}) {
  return {
    applicationStages: APPLICATION_STAGES,
    startApplication(command: StartApplicationCommand): StartApplicationResult {
      const opportunity = dependencies.opportunities.findRankedOpportunity(command);
      if (!opportunity) return { status: "opportunity-not-found" };
      return dependencies.store.startApplication(
        { ...command, nextAction: firstNextAction(command.stage) },
        dependencies.now(),
      );
    },
    createNextAction(command: CreateNextActionCommand): CreateNextActionResult {
      return dependencies.store.createNextAction(command, dependencies.now());
    },
    changeApplicationStage(command: ChangeApplicationStageCommand): ChangeApplicationStageResult {
      return dependencies.store.changeApplicationStage(command, dependencies.now());
    },
    changeNextAction(command: ChangeNextActionCommand): ChangeNextActionResult {
      return dependencies.store.changeNextAction(command, dependencies.now());
    },
    listApplications(): readonly ApplicationRecord[] {
      return dependencies.store.listApplications();
    },
    listTimeline(applicationId: number): readonly TimelineEntry[] {
      return dependencies.store.listTimeline(applicationId);
    },
    listApplicationActions(applicationId: number): readonly ApplicationNextAction[] {
      return dependencies.store.listApplicationActions(applicationId);
    },
    listApplicationRecommendations(applicationId: number): readonly ApplicationRecommendation[] {
      return dependencies.store.listApplicationRecommendations(applicationId);
    },
    acceptRecommendation(command: AcceptRecommendationCommand): AcceptRecommendationResult {
      return dependencies.store.acceptRecommendation(command, dependencies.now());
    },
    dismissRecommendation(command: DismissRecommendationCommand): DismissRecommendationResult {
      return dependencies.store.dismissRecommendation(command, dependencies.now());
    },
    listTodayActions(at: Date): readonly TodayAction[] {
      return [...dependencies.store.listOpenActions()]
        .sort((left, right) => compareTodayActions(left, right, at))
        .map(({ createdAt: _createdAt, ...action }) => action);
    },
  };
}

function firstNextAction(stage: StartApplicationCommand["stage"]): {
  readonly title: string;
  readonly reason: string;
} {
  return stage === "preparing"
    ? {
        title: "Tailor the application",
        reason: "Application preparation has started.",
      }
    : {
        title: "Plan a follow-up",
        reason: "The Application was already submitted.",
      };
}

function compareTodayActions(left: StoredNextAction, right: StoredNextAction, at: Date): number {
  const priorityDifference = todayPriority(left, at) - todayPriority(right, at);
  if (priorityDifference !== 0) return priorityDifference;

  if (dueTime(left) !== dueTime(right)) return dueTime(left) - dueTime(right);

  const createdDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return createdDifference !== 0 ? createdDifference : left.id - right.id;
}

function todayPriority(action: StoredNextAction, at: Date): number {
  if (!action.dueAt) return 3;
  if (action.dueAt < at) return 0;
  return action.dueAt < startOfNextUtcDay(at) ? 1 : 2;
}

function dueTime(action: StoredNextAction): number {
  return action.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
}

function startOfNextUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}
