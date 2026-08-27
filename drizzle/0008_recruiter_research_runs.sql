CREATE TABLE `recruiter_research_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`identity` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recruiter_research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_research_observations_run_identity_idx` ON `recruiter_research_observations` (`run_id`,`identity`);--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE `recruiter_research_source_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`stage` text NOT NULL,
	`message` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recruiter_research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_research_source_failures_run_stage_idx` ON `recruiter_research_source_failures` (`run_id`,`stage`);
