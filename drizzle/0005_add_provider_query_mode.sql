UPDATE `app_settings`
SET
	`value` = json_set(
		`value`,
		'$.brave.titleSearchMode',
		NULL,
		'$.serpapi.titleSearchMode',
		NULL,
		'$.serper.titleSearchMode',
		'anywhere'
	),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'searchProviders';
