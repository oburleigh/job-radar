DROP INDEX `recruiter_research_source_failures_run_stage_idx`;--> statement-breakpoint
ALTER TABLE `recruiter_research_source_failures` ADD `adapter_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_research_source_failures_run_stage_adapter_idx` ON `recruiter_research_source_failures` (`run_id`,`stage`,`adapter_id`);