import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AdvisorExecutionRecord } from "@/contexts/opportunity-tracking/application/advisor-history";

import type {
  AdvisorPolicy,
  AssessmentEvidence,
  AssessmentStatement,
  RecommendationProposal,
} from "@/contexts/opportunity-tracking/application/advisor-workflow";
import type {
  RelationshipPlanProspectReference,
  RelationshipPlanPublicPerson,
} from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import type { ApplicationStage } from "@/contexts/opportunity-tracking/domain/application-stage";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).$type<Date>();

export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    searchProfileId: integer("search_profile_id").notNull(),
    jobListingId: integer("job_listing_id").notNull(),
    stage: text("stage").$type<ApplicationStage>().notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("applications_profile_listing_idx").on(table.searchProfileId, table.jobListingId),
    index("applications_stage_idx").on(table.stage),
  ],
);

export const applicationTimeline = sqliteTable(
  "application_timeline",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "application-migrated",
        "application-started",
        "stage-changed",
        "stage-corrected",
        "next-action-created",
        "next-action-completed",
        "next-action-deferred",
        "next-action-dismissed",
        "next-action-reopened",
      ],
    }).notNull(),
    nextActionId: integer("next_action_id"),
    stage: text("stage").$type<ApplicationStage>().notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
  },
  (table) => [
    index("application_timeline_application_time_idx").on(table.applicationId, table.occurredAt),
  ],
);

export const nextActions = sqliteTable(
  "next_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    state: text("state", { enum: ["open", "completed", "deferred", "dismissed"] })
      .notNull()
      .default("open"),
    dueAt: timestamp("due_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("next_actions_state_due_idx").on(table.state, table.dueAt)],
);

export const applicationRecommendations = sqliteTable(
  "application_recommendations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind", { enum: ["relationship-plan"] }).notNull(),
    sourceRecordId: integer("source_record_id").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    evidenceUrls: text("evidence_urls", { mode: "json" }).$type<readonly string[]>().notNull(),
    state: text("state", { enum: ["proposed", "accepted", "dismissed"] })
      .notNull()
      .default("proposed"),
    acceptedNextActionId: integer("accepted_next_action_id").references(() => nextActions.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("application_recommendations_application_state_idx").on(table.applicationId, table.state),
  ],
);

export const opportunityAssessments = sqliteTable(
  "opportunity_assessments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    searchProfileId: integer("search_profile_id").notNull(),
    jobListingId: integer("job_listing_id").notNull(),
    summary: text("summary", { mode: "json" }).$type<AssessmentStatement>().notNull(),
    strengths: text("strengths", { mode: "json" })
      .$type<readonly AssessmentStatement[]>()
      .notNull(),
    gaps: text("gaps", { mode: "json" }).$type<readonly AssessmentStatement[]>().notNull(),
    evidence: text("evidence", { mode: "json" }).$type<readonly AssessmentEvidence[]>().notNull(),
    recommendations: text("recommendations", { mode: "json" })
      .$type<readonly RecommendationProposal[]>()
      .notNull(),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort").notNull(),
    policyVersion: integer("policy_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    evidenceCutoff: timestamp("evidence_cutoff").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("opportunity_assessments_reference_time_idx").on(
      table.searchProfileId,
      table.jobListingId,
      table.createdAt,
    ),
  ],
);

export const advisorSettings = sqliteTable("advisor_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<AdvisorPolicy>().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const relationshipPlans = sqliteTable(
  "relationship_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    prospectReferences: text("prospect_references", { mode: "json" })
      .$type<readonly RelationshipPlanProspectReference[]>()
      .notNull(),
    publicPeople: text("public_people", { mode: "json" })
      .$type<readonly RelationshipPlanPublicPerson[]>()
      .notNull(),
    recommendations: text("recommendations", { mode: "json" })
      .$type<readonly RecommendationProposal[]>()
      .notNull(),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort").notNull(),
    policyVersion: integer("policy_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    evidenceCutoff: timestamp("evidence_cutoff").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("relationship_plans_application_time_idx").on(table.applicationId, table.createdAt),
  ],
);

export const advisorExecutions = sqliteTable(
  "advisor_executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").$type<AdvisorExecutionRecord["kind"]>().notNull(),
    searchProfileId: integer("search_profile_id").notNull(),
    jobListingId: integer("job_listing_id").notNull(),
    applicationId: integer("application_id"),
    policy: text("policy", { mode: "json" }).$type<AdvisorPolicy>().notNull(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    status: text("status").$type<AdvisorExecutionRecord["status"]>().notNull(),
    reason: text("reason"),
    retryOf: integer("retry_of"),
  },
  (table) => [
    index("advisor_executions_owner_idx").on(
      table.kind,
      table.searchProfileId,
      table.jobListingId,
      table.applicationId,
    ),
  ],
);
