INSERT OR IGNORE INTO `app_settings` (`key`, `value`, `updated_at`)
VALUES (
  'integrationPolicy',
  '{"customPriority":200}',
  unixepoch() * 1000
);
