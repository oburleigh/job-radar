import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  JOB_LISTING_EVIDENCE,
  type JobListingEvidence,
} from "@/contexts/discovery/domain/job-listing-provenance";
import { JOB_LISTING_STATES } from "@/contexts/discovery/domain/job-listing-state";
import type { ExclusionReason, MatchReason } from "@/contexts/discovery/domain/job-match";
import type {
  AtsType,
  BoardConfig,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).$type<Date>();

export const searchProfiles = sqliteTable("search_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  titleTerms: text("title_terms", { mode: "json" }).$type<string[]>().notNull(),
  locationTerms: text("location_terms", { mode: "json" }).$type<string[]>().notNull(),
  requiredJobTerms: text("required_job_terms", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  excludedTitleTerms: text("excluded_title_terms", { mode: "json" }).$type<string[]>().notNull(),
  excludedLocationTerms: text("excluded_location_terms", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  excludedDescriptionTerms: text("excluded_description_terms", {
    mode: "json",
  })
    .$type<string[]>()
    .notNull(),
  includeRemote: integer("include_remote", { mode: "boolean" }).notNull().default(false),
  includeUnverified: integer("include_unverified", { mode: "boolean" }).notNull().default(false),
  salaryCurrency: text("salary_currency").notNull().default(""),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  maxAgeDays: integer("max_age_days").notNull().default(30),
  minScore: integer("min_score").notNull().default(70),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const sourceDomains = sqliteTable(
  "source_domains",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    atsType: text("ats_type").$type<AtsType>().notNull(),
    pattern: text("pattern").notNull().unique(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    supportsBoardSync: integer("supports_board_sync", { mode: "boolean" }).notNull().default(false),
    priority: integer("priority").notNull().default(100),
  },
  (table) => [index("source_domains_priority_idx").on(table.priority)],
);

export const atsIntegrations = sqliteTable("ats_integrations", {
  atsType: text("ats_type").$type<AtsType>().primaryKey(),
  label: text("label").notNull(),
  hostnames: text("hostnames", { mode: "json" }).$type<string[]>().notNull(),
  hostSuffixes: text("host_suffixes", { mode: "json" }).$type<string[]>().notNull(),
  supportsBoardSync: integer("supports_board_sync", { mode: "boolean" }).notNull().default(false),
  priority: integer("priority").notNull().default(100),
  pageSize: integer("page_size"),
  endpoints: text("endpoints", { mode: "json" }).$type<Record<string, string>>().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const companyBoards = sqliteTable(
  "company_boards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    atsType: text("ats_type").$type<AtsType>().notNull(),
    canonicalKey: text("canonical_key").notNull().unique(),
    companyName: text("company_name").notNull().default(""),
    slug: text("slug").notNull(),
    baseUrl: text("base_url").notNull(),
    config: text("config", { mode: "json" }).$type<BoardConfig>().notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    discoveredAt: timestamp("discovered_at").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    lastError: text("last_error").notNull().default(""),
    lastWarning: text("last_warning").notNull().default(""),
  },
  (table) => [
    index("company_boards_ats_idx").on(table.atsType),
    index("company_boards_enabled_idx").on(table.enabled),
  ],
);

export const discoveryRuns = sqliteTable(
  "discovery_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => searchProfiles.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("running"),
    phase: text("phase", {
      enum: ["known-boards", "web-coverage", "matching"],
    }),
    knownBoardCount: integer("known_board_count"),
    knownBoardCompletedCount: integer("known_board_completed_count"),
    knownBoardSuccessCount: integer("known_board_success_count"),
    activeBoardName: text("active_board_name"),
    webCoverageStatus: text("web_coverage_status", {
      enum: ["pending", "running", "completed", "skipped", "failed"],
    }),
    queryCount: integer("query_count").notNull().default(0),
    hitCount: integer("hit_count").notNull().default(0),
    boardsDiscovered: integer("boards_discovered").notNull().default(0),
    jobsUpserted: integer("jobs_upserted").notNull().default(0),
    matchesFound: integer("matches_found").notNull().default(0),
    queryErrorCount: integer("query_error_count").notNull().default(0),
    syncErrorCount: integer("sync_error_count").notNull().default(0),
    error: text("error").notNull().default(""),
    budgetStopReason: text("budget_stop_reason", {
      enum: ["max-requests-per-run"],
    }),
    startedAt: timestamp("started_at").notNull(),
    heartbeatAt: timestamp("heartbeat_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("discovery_runs_profile_idx").on(table.profileId),
    index("discovery_runs_started_idx").on(table.startedAt),
  ],
);

export const discoveryQueries = sqliteTable(
  "discovery_queries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => discoveryRuns.id, { onDelete: "cascade" }),
    atsType: text("ats_type").$type<AtsType>().notNull(),
    sourcePattern: text("source_pattern").notNull(),
    titleTerm: text("title_term").notNull(),
    queryText: text("query_text").notNull(),
    marketKey: text("market_key"),
    countryCode: text("country_code"),
    searchLanguage: text("search_language"),
    laneKind: text("lane_kind", {
      enum: ["role", "board-discovery", "worldwide-remote"],
    }),
    strategy: text("strategy", {
      enum: ["role-first", "location-first", "phrase", "relaxed-title"],
    }),
    page: integer("page"),
    status: text("status", {
      enum: ["planned", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("planned"),
    hitCount: integer("hit_count").notNull().default(0),
    usefulHitCount: integer("useful_hit_count").notNull().default(0),
    hasMore: integer("has_more", { mode: "boolean" }),
    stopReason: text("stop_reason", {
      enum: [
        "no-more-results",
        "insufficient-useful-hits",
        "max-pages-per-lane",
        "max-requests-per-run",
      ],
    }),
    error: text("error").notNull().default(""),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("discovery_queries_run_idx").on(table.runId),
    index("discovery_queries_run_ats_idx").on(table.runId, table.atsType),
  ],
);

export const discoveryHits = sqliteTable(
  "discovery_hits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => discoveryRuns.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    rank: integer("rank").notNull(),
    title: text("title").notNull().default(""),
    url: text("url").notNull(),
    snippet: text("snippet").notNull().default(""),
    atsType: text("ats_type").$type<AtsType>(),
    boardId: integer("board_id").references(() => companyBoards.id, {
      onDelete: "set null",
    }),
    verificationStatus: text("verification_status", {
      enum: ["verified", "closed", "not_found", "protected", "transient_failure"],
    }),
    verificationReason: text("verification_reason").notNull().default(""),
    verificationUrl: text("verification_url").notNull().default(""),
    verificationCheckedAt: timestamp("verification_checked_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("discovery_hits_run_url_idx").on(table.runId, table.url)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    boardId: integer("board_id").references(() => companyBoards.id, {
      onDelete: "set null",
    }),
    atsType: text("ats_type").$type<AtsType>().notNull(),
    externalId: text("external_id").notNull().default(""),
    dedupeKey: text("dedupe_key").notNull().unique(),
    canonicalUrl: text("canonical_url").notNull(),
    applyUrl: text("apply_url").notNull().default(""),
    companyName: text("company_name").notNull().default(""),
    title: text("title").notNull(),
    locationText: text("location_text").notNull().default(""),
    locations: text("locations", { mode: "json" }).$type<string[]>().notNull(),
    description: text("description").notNull().default(""),
    department: text("department").notNull().default(""),
    employmentType: text("employment_type").notNull().default(""),
    workplaceType: text("workplace_type").notNull().default(""),
    publishedAt: timestamp("published_at"),
    salaryCurrency: text("salary_currency").notNull().default(""),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    evidence: text("evidence", { enum: JOB_LISTING_EVIDENCE })
      .$type<JobListingEvidence>()
      .notNull()
      .default("search-lead"),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("jobs_ats_external_idx").on(table.atsType, table.externalId),
    index("jobs_active_published_idx").on(table.isActive, table.publishedAt),
  ],
);

export const jobMatches = sqliteTable(
  "job_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => searchProfiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["matched", "excluded"] }).notNull(),
    score: integer("score").notNull().default(0),
    reasons: text("reasons", { mode: "json" }).$type<readonly MatchReason[]>().notNull(),
    exclusionReasons: text("exclusion_reasons", { mode: "json" })
      .$type<readonly ExclusionReason[]>()
      .notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_matches_profile_job_idx").on(table.profileId, table.jobId),
    index("job_matches_status_score_idx").on(table.status, table.score),
  ],
);

export const jobStates = sqliteTable(
  "job_states",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => searchProfiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: JOB_LISTING_STATES,
    })
      .notNull()
      .default("new"),
    notes: text("notes").notNull().default(""),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_states_profile_job_idx").on(table.profileId, table.jobId),
    index("job_states_status_idx").on(table.status),
  ],
);

export const profileRelations = relations(searchProfiles, ({ many }) => ({
  runs: many(discoveryRuns),
  matches: many(jobMatches),
  states: many(jobStates),
}));

export const discoveryRunRelations = relations(discoveryRuns, ({ many }) => ({
  queries: many(discoveryQueries),
  hits: many(discoveryHits),
}));

export const boardRelations = relations(companyBoards, ({ many }) => ({
  jobs: many(jobs),
  hits: many(discoveryHits),
}));

export const jobRelations = relations(jobs, ({ one, many }) => ({
  board: one(companyBoards, {
    fields: [jobs.boardId],
    references: [companyBoards.id],
  }),
  matches: many(jobMatches),
  states: many(jobStates),
}));
