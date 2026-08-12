ALTER TABLE `search_profiles`
ADD `excluded_location_terms` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint

UPDATE `search_profiles`
SET
	`excluded_location_terms` = '["Canada","United States","USA"]',
	`updated_at` = unixepoch() * 1000
WHERE `name` LIKE 'UK %';
