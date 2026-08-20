CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ats_integrations` (
	`ats_type` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`hostnames` text NOT NULL,
	`host_suffixes` text NOT NULL,
	`supports_board_sync` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`page_size` integer,
	`endpoints` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_boards_canonical_key_unique` ON `company_boards` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `company_boards_ats_idx` ON `company_boards` (`ats_type`);--> statement-breakpoint
CREATE INDEX `company_boards_enabled_idx` ON `company_boards` (`enabled`);--> statement-breakpoint
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
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_hits_run_url_idx` ON `discovery_hits` (`run_id`,`url`);--> statement-breakpoint
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
	`finished_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discovery_queries_run_idx` ON `discovery_queries` (`run_id`);--> statement-breakpoint
CREATE INDEX `discovery_queries_run_ats_idx` ON `discovery_queries` (`run_id`,`ats_type`);--> statement-breakpoint
CREATE TABLE `discovery_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`query_count` integer DEFAULT 0 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`boards_discovered` integer DEFAULT 0 NOT NULL,
	`jobs_upserted` integer DEFAULT 0 NOT NULL,
	`matches_found` integer DEFAULT 0 NOT NULL,
	`query_error_count` integer DEFAULT 0 NOT NULL,
	`sync_error_count` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`heartbeat_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discovery_runs_profile_idx` ON `discovery_runs` (`profile_id`);--> statement-breakpoint
CREATE INDEX `discovery_runs_started_idx` ON `discovery_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `job_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`status` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`reasons` text NOT NULL,
	`exclusion_reasons` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_matches_profile_job_idx` ON `job_matches` (`profile_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_matches_status_score_idx` ON `job_matches` (`status`,`score`);--> statement-breakpoint
CREATE TABLE `job_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_states_profile_job_idx` ON `job_states` (`profile_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_states_status_idx` ON `job_states` (`status`);--> statement-breakpoint
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
	`raw_payload` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_ats_external_idx` ON `jobs` (`ats_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `jobs_active_published_idx` ON `jobs` (`is_active`,`published_at`);--> statement-breakpoint
CREATE TABLE `search_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`title_terms` text NOT NULL,
	`location_terms` text NOT NULL,
	`required_job_terms` text DEFAULT '[]' NOT NULL,
	`excluded_title_terms` text NOT NULL,
	`excluded_location_terms` text DEFAULT '[]' NOT NULL,
	`excluded_description_terms` text NOT NULL,
	`include_remote` integer DEFAULT false NOT NULL,
	`include_unverified` integer DEFAULT false NOT NULL,
	`salary_currency` text DEFAULT '' NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`max_age_days` integer DEFAULT 30 NOT NULL,
	`min_score` integer DEFAULT 70 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_profiles_name_unique` ON `search_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `source_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ats_type` text NOT NULL,
	`pattern` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`supports_board_sync` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_domains_pattern_unique` ON `source_domains` (`pattern`);--> statement-breakpoint
CREATE INDEX `source_domains_priority_idx` ON `source_domains` (`priority`);