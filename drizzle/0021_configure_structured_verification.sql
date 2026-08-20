UPDATE `app_settings`
SET
  `value` = json_set(
    `value`,
    '$.structuredVerificationSources',
    json('["web3-career","cryptocurrencyjobs","cryptojobslist"]'),
    '$.closedListingMarkers',
    json('["career opportunity is no longer available","no longer accepting applications","this job is no longer available","this job is closed","position has been filled"]')
  ),
  `updated_at` = unixepoch() * 1000
WHERE `key` = 'discovery';
