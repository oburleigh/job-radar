CREATE TABLE `company_boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ats_type` text NOT NULL,
	`canonical_key` text NOT NULL,
	`company_name` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`base_url` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`discovered_at` integer NOT NULL,
	`last_synced_at` integer,
	`last_error` text DEFAULT '' NOT NULL
, `last_warning` text DEFAULT '' NOT NULL);

CREATE TABLE `discovery_hits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`query` text NOT NULL,
	`rank` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`ats_type` text,
	`board_id` integer,
	`created_at` integer NOT NULL, `verification_status` text, `verification_reason` text DEFAULT '' NOT NULL, `verification_url` text DEFAULT '' NOT NULL, `verification_checked_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `discovery_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`query_count` integer DEFAULT 0 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`boards_discovered` integer DEFAULT 0 NOT NULL,
	`jobs_upserted` integer DEFAULT 0 NOT NULL,
	`query_error_count` integer DEFAULT 0 NOT NULL,
	`sync_error_count` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer, `matches_found` integer DEFAULT 0 NOT NULL, `heartbeat_at` integer, `budget_stop_reason` text, `phase` text, `known_board_count` integer, `known_board_success_count` integer, `web_coverage_status` text, `known_board_completed_count` integer, `active_board_name` text,
	FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `job_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`status` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`reasons` text NOT NULL,
	`exclusion_reasons` text NOT NULL,
	`updated_at` integer NOT NULL, `excluded_title_reason_count` integer, `excluded_location_reason_count` integer, `stale_reason_count` integer, `unverified_reason_count` integer, `context_reason_count` integer, `salary_reason_count` integer, `listing_is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer,
	`ats_type` text NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
	`dedupe_key` text NOT NULL,
	`canonical_url` text NOT NULL,
	`apply_url` text DEFAULT '' NOT NULL,
	`company_name` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`location_text` text DEFAULT '' NOT NULL,
	`locations` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`employment_type` text DEFAULT '' NOT NULL,
	`workplace_type` text DEFAULT '' NOT NULL,
	`published_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`raw_payload` text NOT NULL, `salary_currency` text DEFAULT '' NOT NULL, `salary_min` integer, `salary_max` integer, `evidence` text DEFAULT 'search-lead' NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `search_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`title_terms` text NOT NULL,
	`location_terms` text NOT NULL,
	`excluded_title_terms` text NOT NULL,
	`excluded_description_terms` text NOT NULL,
	`include_remote` integer DEFAULT false NOT NULL,
	`max_age_days` integer DEFAULT 30 NOT NULL,
	`min_score` integer DEFAULT 70 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `required_job_terms` text DEFAULT '[]' NOT NULL, `include_unverified` integer DEFAULT false NOT NULL, `excluded_location_terms` text DEFAULT '[]' NOT NULL, `salary_currency` text DEFAULT '' NOT NULL, `salary_min` integer, `salary_max` integer);

CREATE TABLE `discovery_queries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `ats_type` text NOT NULL,
  `source_pattern` text NOT NULL,
  `title_term` text NOT NULL,
  `query_text` text NOT NULL,
  `status` text DEFAULT 'planned' NOT NULL,
  `hit_count` integer DEFAULT 0 NOT NULL,
  `error` text DEFAULT '' NOT NULL,
  `started_at` integer,
  `finished_at` integer, `market_key` text, `country_code` text, `search_language` text, `lane_kind` text, `strategy` text, `page` integer, `useful_hit_count` integer DEFAULT 0 NOT NULL, `has_more` integer, `stop_reason` text,
  FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `recruiter_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`retry_of_run_id` text,
	`brief` text NOT NULL,
	`criteria` text NOT NULL,
	`recruiter_target` integer NOT NULL,
	`policy` text NOT NULL,
	`source_plan` text NOT NULL,
	`budget` text NOT NULL,
	`budget_usage` text NOT NULL,
	`budget_exhaustion` text,
	`status` text NOT NULL,
	`checkpoint` text NOT NULL,
	`completion_reason` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer
, continued_from_run_id TEXT);

CREATE TABLE `recruiter_research_source_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`stage` text NOT NULL,
	`message` text NOT NULL,
	`recorded_at` integer NOT NULL, `adapter_id` text,
	FOREIGN KEY (`run_id`) REFERENCES `recruiter_research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
