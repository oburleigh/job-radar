UPDATE `app_settings`
SET
	`value` = json_set(`value`, '$.serper.maxResults', 10),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'searchProviders';
