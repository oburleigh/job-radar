ALTER TABLE `jobs` ADD `salary_currency` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_min` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salary_max` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `evidence` text DEFAULT 'search-lead' NOT NULL;