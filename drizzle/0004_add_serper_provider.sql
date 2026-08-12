UPDATE `app_settings`
SET
	`value` = json_set(
		`value`,
		'$.brave.label',
		'Brave Search',
		'$.brave.apiKeyEnv',
		'BRAVE_SEARCH_API_KEY',
		'$.brave.enabled',
		json('true'),
		'$.brave.priority',
		20,
		'$.serpapi.label',
		'Google via SerpAPI',
		'$.serpapi.apiKeyEnv',
		'SERPAPI_KEY',
		'$.serpapi.enabled',
		json('true'),
		'$.serpapi.priority',
		30,
		'$.serper',
		json('{"label":"Google via Serper.dev","endpoint":"https://google.serper.dev/search","maxResults":100,"parameters":{},"apiKeyEnv":"SERPER_API_KEY","enabled":true,"priority":10}')
	),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'searchProviders';
