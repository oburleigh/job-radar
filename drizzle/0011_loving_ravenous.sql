ALTER TABLE `job_matches` ADD `excluded_title_reason_count` integer;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `excluded_location_reason_count` integer;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `stale_reason_count` integer;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `unverified_reason_count` integer;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `context_reason_count` integer;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `salary_reason_count` integer;--> statement-breakpoint
CREATE INDEX `job_matches_screening_summary_idx` ON `job_matches` (`profile_id`,`status`,`job_id`,`excluded_title_reason_count`,`excluded_location_reason_count`,`stale_reason_count`,`unverified_reason_count`,`context_reason_count`,`salary_reason_count`);--> statement-breakpoint
CREATE INDEX `jobs_active_id_idx` ON `jobs` (`is_active`,`id`);
