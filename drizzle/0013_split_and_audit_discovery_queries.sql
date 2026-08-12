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
CREATE INDEX `discovery_queries_run_idx`
ON `discovery_queries` (`run_id`);
--> statement-breakpoint
CREATE INDEX `discovery_queries_run_ats_idx`
ON `discovery_queries` (`run_id`, `ats_type`);
--> statement-breakpoint
UPDATE `app_settings`
SET
  `value` = json_remove(`value`, '$.termsPerQuery'),
  `updated_at` = unixepoch() * 1000
WHERE `key` = 'discovery';
