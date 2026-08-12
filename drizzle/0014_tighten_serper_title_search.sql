UPDATE `app_settings`
SET
  `value` = json_set(`value`, '$.serper.titleSearchMode', 'title'),
  `updated_at` = unixepoch() * 1000
WHERE `key` = 'searchProviders';
