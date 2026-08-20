UPDATE `app_settings`
SET
  `value` = json_set(
    `value`,
    '$.workYieldBatchSize',
    25,
    '$.runHistoryLimit',
    100
  ),
  `updated_at` = unixepoch() * 1000
WHERE `key` = 'discovery';
