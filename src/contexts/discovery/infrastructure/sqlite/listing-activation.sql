CREATE TRIGGER `job_matches_follow_listing_activation`
AFTER UPDATE OF `is_active` ON `jobs`
FOR EACH ROW WHEN OLD.`is_active` <> NEW.`is_active`
BEGIN
  UPDATE `job_matches` SET `listing_is_active` = NEW.`is_active` WHERE `job_id` = NEW.`id`;
END;
