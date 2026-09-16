// Exact pre-versioning ALTER TABLE layouts; unknown SQL still fails the schema guard.
export const historicalSchemaSql = new Map<string, string>([
  [
    "76c2ade80e5b2b489f1825bb2a4115066bf18fd059eb1e5321c45a4e0f24e9fe",
    "CREATE TABLE `company_boards` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `ats_type` text NOT NULL, `canonical_key` text NOT NULL, `company_name` text DEFAULT '' NOT NULL, `slug` text NOT NULL, `base_url` text NOT NULL, `config` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `discovered_at` integer NOT NULL, `last_synced_at` integer, `last_error` text DEFAULT '' NOT NULL, `last_warning` text DEFAULT '' NOT NULL )",
  ],
  [
    "3e235e9329a2a48d1e5549f5c14ee64f2c13ee7f5507413f6e174163d4216c18",
    "CREATE TABLE `discovery_hits` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `run_id` integer NOT NULL, `query` text NOT NULL, `rank` integer NOT NULL, `title` text DEFAULT '' NOT NULL, `url` text NOT NULL, `snippet` text DEFAULT '' NOT NULL, `ats_type` text, `board_id` integer, `verification_status` text, `verification_reason` text DEFAULT '' NOT NULL, `verification_url` text DEFAULT '' NOT NULL, `verification_checked_at` integer, `created_at` integer NOT NULL, FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null )",
  ],
  [
    "c06283639a9c9914f8a13d6d000a31777197fd40d241dcc3ef1bceea3e14711d",
    "CREATE TABLE `discovery_runs` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `profile_id` integer NOT NULL, `provider` text NOT NULL, `status` text DEFAULT 'running' NOT NULL, `phase` text, `known_board_count` integer, `known_board_completed_count` integer, `known_board_success_count` integer, `active_board_name` text, `web_coverage_status` text, `query_count` integer DEFAULT 0 NOT NULL, `hit_count` integer DEFAULT 0 NOT NULL, `boards_discovered` integer DEFAULT 0 NOT NULL, `jobs_upserted` integer DEFAULT 0 NOT NULL, `matches_found` integer DEFAULT 0 NOT NULL, `query_error_count` integer DEFAULT 0 NOT NULL, `sync_error_count` integer DEFAULT 0 NOT NULL, `error` text DEFAULT '' NOT NULL, `budget_stop_reason` text, `started_at` integer NOT NULL, `heartbeat_at` integer, `finished_at` integer, FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade )",
  ],
  [
    "30ef19a9d6bc7071a8eed50425dd649e4c7c630da44a90b30909da8650e370da",
    "CREATE TABLE `job_matches` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `profile_id` integer NOT NULL, `job_id` integer NOT NULL, `status` text NOT NULL, `score` integer DEFAULT 0 NOT NULL, `reasons` text NOT NULL, `exclusion_reasons` text NOT NULL, `excluded_title_reason_count` integer, `excluded_location_reason_count` integer, `stale_reason_count` integer, `unverified_reason_count` integer, `context_reason_count` integer, `salary_reason_count` integer, `listing_is_active` integer DEFAULT true NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`profile_id`) REFERENCES `search_profiles`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade )",
  ],
  [
    "59ec58971d8217f14244f97fe00d24c8cbb47f1dad06645ce3e866bdd0002ee0",
    "CREATE TABLE `jobs` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `board_id` integer, `ats_type` text NOT NULL, `external_id` text DEFAULT '' NOT NULL, `dedupe_key` text NOT NULL, `canonical_url` text NOT NULL, `apply_url` text DEFAULT '' NOT NULL, `company_name` text DEFAULT '' NOT NULL, `title` text NOT NULL, `location_text` text DEFAULT '' NOT NULL, `locations` text NOT NULL, `description` text DEFAULT '' NOT NULL, `department` text DEFAULT '' NOT NULL, `employment_type` text DEFAULT '' NOT NULL, `workplace_type` text DEFAULT '' NOT NULL, `published_at` integer, `salary_currency` text DEFAULT '' NOT NULL, `salary_min` integer, `salary_max` integer, `evidence` text DEFAULT 'search-lead' NOT NULL, `first_seen_at` integer NOT NULL, `last_seen_at` integer NOT NULL, `is_active` integer DEFAULT true NOT NULL, `raw_payload` text NOT NULL, FOREIGN KEY (`board_id`) REFERENCES `company_boards`(`id`) ON UPDATE no action ON DELETE set null )",
  ],
  [
    "46b051aaaeeed4e399f90e54dc24a0c4a9c7226556e637ccd0951a61c02110fd",
    "CREATE TABLE `search_profiles` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `name` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `title_terms` text NOT NULL, `location_terms` text NOT NULL, `required_job_terms` text DEFAULT '[]' NOT NULL, `excluded_title_terms` text NOT NULL, `excluded_location_terms` text DEFAULT '[]' NOT NULL, `excluded_description_terms` text NOT NULL, `include_remote` integer DEFAULT false NOT NULL, `include_unverified` integer DEFAULT false NOT NULL, `salary_currency` text DEFAULT '' NOT NULL, `salary_min` integer, `salary_max` integer, `max_age_days` integer DEFAULT 30 NOT NULL, `min_score` integer DEFAULT 70 NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL )",
  ],
  [
    "1dc05153caa62b8354a9b80718c5f99a514a8d7b2806223410cd172e1e6c2032",
    "CREATE TABLE `discovery_queries` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `run_id` integer NOT NULL, `ats_type` text NOT NULL, `source_pattern` text NOT NULL, `title_term` text NOT NULL, `query_text` text NOT NULL, `market_key` text, `country_code` text, `search_language` text, `lane_kind` text, `strategy` text, `page` integer, `status` text DEFAULT 'planned' NOT NULL, `hit_count` integer DEFAULT 0 NOT NULL, `useful_hit_count` integer DEFAULT 0 NOT NULL, `has_more` integer, `stop_reason` text, `error` text DEFAULT '' NOT NULL, `started_at` integer, `finished_at` integer, FOREIGN KEY (`run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE cascade )",
  ],
  [
    "6dcea26eafdfb89d198d6aeeabbf9d9420f9f14ad0bbb7ef6c1cc79ce87b1447",
    "CREATE TABLE `recruiter_research_runs` ( `id` text PRIMARY KEY NOT NULL, `retry_of_run_id` text, `continued_from_run_id` text, `brief` text NOT NULL, `criteria` text NOT NULL, `recruiter_target` integer NOT NULL, `policy` text NOT NULL, `source_plan` text NOT NULL, `budget` text NOT NULL, `budget_usage` text NOT NULL, `budget_exhaustion` text, `status` text NOT NULL, `checkpoint` text NOT NULL, `completion_reason` text, `started_at` integer NOT NULL, `updated_at` integer NOT NULL, `finished_at` integer )",
  ],
  [
    "fb013286601777b849156b174f49fe8dd819890573da7dbfcb5d04c966e0b42b",
    "CREATE TABLE `recruiter_research_source_failures` ( `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `run_id` text NOT NULL, `adapter_id` text, `stage` text NOT NULL, `message` text NOT NULL, `recorded_at` integer NOT NULL, FOREIGN KEY (`run_id`) REFERENCES `recruiter_research_runs`(`id`) ON UPDATE no action ON DELETE cascade )",
  ],
  [
    "c7f75c0de67d6de0bc75e5cad03ec35d343a50944487cf6de6007b799e5eef4e",
    "CREATE INDEX `discovery_queries_run_ats_idx` ON `discovery_queries` (`run_id`,`ats_type`)",
  ],
]);
