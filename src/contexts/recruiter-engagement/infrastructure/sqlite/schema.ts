import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).$type<Date>();

export const recruiterResearchRuns = sqliteTable("recruiter_research_runs", {
  id: text("id").primaryKey(),
  retryOfRunId: text("retry_of_run_id"),
  brief: text("brief").notNull(),
  criteria: text("criteria", { mode: "json" }).$type<unknown>().notNull(),
  recruiterTarget: integer("recruiter_target").notNull(),
  policy: text("policy", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  sourcePlan: text("source_plan", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  budget: text("budget", { mode: "json" }).$type<unknown>().notNull(),
  budgetUsage: text("budget_usage", { mode: "json" }).$type<unknown>().notNull(),
  budgetExhaustion: text("budget_exhaustion", { mode: "json" }).$type<unknown>(),
  status: text("status", {
    enum: ["pending", "running", "completed", "partial", "failed", "cancelled", "interrupted"],
  }).notNull(),
  checkpoint: text("checkpoint", { enum: ["firms", "recruiters", "completed"] }).notNull(),
  completionReason: text("completion_reason"),
  startedAt: timestamp("started_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  finishedAt: timestamp("finished_at"),
});

export const recruiterResearchObservations = sqliteTable(
  "recruiter_research_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => recruiterResearchRuns.id, { onDelete: "cascade" }),
    identity: text("identity").notNull(),
    kind: text("kind", { enum: ["firm", "recruiter"] }).notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("recruiter_research_observations_run_identity_idx").on(table.runId, table.identity),
  ],
);

export const recruiterResearchSourceFailures = sqliteTable(
  "recruiter_research_source_failures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => recruiterResearchRuns.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: ["firms", "recruiters"] }).notNull(),
    message: text("message").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("recruiter_research_source_failures_run_stage_idx").on(table.runId, table.stage),
  ],
);

export const recruiterResearchSettings = sqliteTable("recruiter_research_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
