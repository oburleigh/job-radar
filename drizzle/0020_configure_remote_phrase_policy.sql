UPDATE `app_settings`
SET
  `value` = json_set(
    `value`,
    '$.unrestrictedRemotePhrases',
    json('["work from anywhere","anywhere in the world","work remotely from anywhere","globally remote","global remote","worldwide remote","remote worldwide","location agnostic"]')
  ),
  `updated_at` = unixepoch() * 1000
WHERE `key` = 'matching';
