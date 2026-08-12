ALTER TABLE `discovery_runs`
ADD `heartbeat_at` integer;
--> statement-breakpoint
UPDATE `discovery_runs`
SET `heartbeat_at` = COALESCE(`finished_at`, `started_at`);
--> statement-breakpoint
INSERT INTO `app_settings` (`key`, `value`, `updated_at`)
VALUES (
  'ui',
  '{"discoveryPollIntervalMs":3000,"discoveryStaleAfterMs":300000}',
  unixepoch() * 1000
)
ON CONFLICT (`key`) DO NOTHING;
