ALTER TABLE `discovery_queries` ADD `market_key` text;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `country_code` text;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `search_language` text;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `lane_kind` text;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `strategy` text;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `page` integer;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `useful_hit_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_queries` ADD `has_more` integer;