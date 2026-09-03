DROP INDEX `job_matches_screening_summary_idx`;--> statement-breakpoint
ALTER TABLE `job_matches` ADD `listing_is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `job_matches_screening_summary_idx` ON `job_matches` (`profile_id`,`status`,`listing_is_active`,`excluded_title_reason_count`,`excluded_location_reason_count`,`stale_reason_count`,`unverified_reason_count`,`context_reason_count`,`salary_reason_count`);--> statement-breakpoint
CREATE TRIGGER `job_matches_follow_listing_activation`
AFTER UPDATE OF `is_active` ON `jobs`
FOR EACH ROW WHEN OLD.`is_active` <> NEW.`is_active`
BEGIN
  UPDATE `job_matches` SET `listing_is_active` = NEW.`is_active` WHERE `job_id` = NEW.`id`;
END;
