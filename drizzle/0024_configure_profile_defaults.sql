INSERT OR IGNORE INTO `app_settings` (`key`, `value`, `updated_at`)
VALUES (
  'profileDefaults',
  '{"maximumAgeDays":30,"minimumScore":70,"salaryCurrency":""}',
  unixepoch() * 1000
);
