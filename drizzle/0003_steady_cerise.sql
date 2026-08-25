ALTER TABLE `discovery_hits` ADD `verification_status` text;--> statement-breakpoint
ALTER TABLE `discovery_hits` ADD `verification_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_hits` ADD `verification_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_hits` ADD `verification_checked_at` integer;