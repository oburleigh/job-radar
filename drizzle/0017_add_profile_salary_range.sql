ALTER TABLE `search_profiles`
ADD `salary_currency` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `search_profiles`
ADD `salary_min` integer;
--> statement-breakpoint
ALTER TABLE `search_profiles`
ADD `salary_max` integer;
