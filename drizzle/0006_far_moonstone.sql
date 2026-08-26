ALTER TABLE `discovery_runs` ADD `phase` text;--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `known_board_count` integer;--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `known_board_success_count` integer;--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `web_coverage_status` text;