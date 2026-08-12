UPDATE `search_profiles`
SET
  `max_age_days` = 365,
  `updated_at` = unixepoch() * 1000
WHERE `name` = 'UK platform and infrastructure IC';
