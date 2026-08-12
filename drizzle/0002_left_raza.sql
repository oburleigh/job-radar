ALTER TABLE `search_profiles` ADD `required_job_terms` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `app_settings`
SET
	`value` = json_set(
		`value`,
		'$.titleSearchMode',
		'title',
		'$.searchFreshnessDays',
		0
	),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'discovery';
--> statement-breakpoint
UPDATE `app_settings`
SET
	`value` = json_set(
		`value`,
		'$.partialTokenThreshold',
		0.8,
		'$.genericTitleTerms',
		json('["head","vp","vice","president","director","senior","manager","principal","chief","lead"]')
	),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'matching';
--> statement-breakpoint
UPDATE `app_settings`
SET
	`value` = json_set(
		`value`,
		'$.brave.parameters.text_decorations',
		'false',
		'$.brave.parameters.spellcheck',
		'false',
		'$.brave.parameters.result_filter',
		'web'
	),
	`updated_at` = unixepoch() * 1000
WHERE `key` = 'searchProviders';
--> statement-breakpoint
UPDATE `ats_integrations`
SET
	`host_suffixes` = '[".linkedin.com"]',
	`updated_at` = unixepoch() * 1000
WHERE `ats_type` = 'linkedin';
