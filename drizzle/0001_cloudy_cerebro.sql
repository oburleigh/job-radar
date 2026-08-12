CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ats_integrations` (
	`ats_type` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`hostnames` text NOT NULL,
	`host_suffixes` text NOT NULL,
	`supports_board_sync` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`page_size` integer,
	`endpoints` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `app_settings` (`key`, `value`, `updated_at`) VALUES
	('network', '{"timeoutMs":30000,"userAgent":"JobRadar/0.2 (local personal job discovery)"}', unixepoch() * 1000),
	('discovery', '{"termsPerQuery":4,"resultsPerQuery":20,"boardJobLimit":200}', unixepoch() * 1000),
	('matching', '{"exactTitleScore":60,"fullTokenScore":50,"partialTokenScore":42,"partialTokenThreshold":0.66,"locationScore":30,"remoteScore":25,"unknownDateScore":5,"freshnessMaxScore":10,"freshnessMinimumScore":2,"freshnessStepDays":3,"stopWords":["a","an","and","of","the","to"],"remoteTerms":["remote"]}', unixepoch() * 1000),
	('searchProviders', '{"brave":{"endpoint":"https://api.search.brave.com/res/v1/web/search","maxResults":20,"parameters":{"safesearch":"moderate"}},"serpapi":{"endpoint":"https://serpapi.com/search.json","maxResults":100,"parameters":{"engine":"google"}}}', unixepoch() * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `ats_integrations` (`ats_type`, `label`, `hostnames`, `host_suffixes`, `supports_board_sync`, `priority`, `page_size`, `endpoints`, `updated_at`) VALUES
	('ashby', 'Ashby', '["jobs.ashbyhq.com"]', '[]', true, 10, NULL, '{"jobs":"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"}', unixepoch() * 1000),
	('greenhouse', 'Greenhouse', '["boards.greenhouse.io","job-boards.greenhouse.io"]', '[]', true, 20, NULL, '{"jobs":"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"}', unixepoch() * 1000),
	('lever', 'Lever', '["jobs.lever.co","jobs.eu.lever.co"]', '[]', true, 30, NULL, '{"jobs":"https://api.lever.co/v0/postings/{slug}?mode=json","jobsEu":"https://api.eu.lever.co/v0/postings/{slug}?mode=json"}', unixepoch() * 1000),
	('bamboohr', 'BambooHR', '["jobs.bamboohr.com"]', '[".bamboohr.com"]', true, 40, NULL, '{"jobs":"https://{slug}.bamboohr.com/careers/list"}', unixepoch() * 1000),
	('workable', 'Workable', '["apply.workable.com","careers.workable.com"]', '[]', true, 50, NULL, '{"jobs":"https://apply.workable.com/api/v1/widget/accounts/{slug}"}', unixepoch() * 1000),
	('smartrecruiters', 'SmartRecruiters', '["jobs.smartrecruiters.com","careers.smartrecruiters.com"]', '[]', true, 60, 100, '{"jobs":"https://api.smartrecruiters.com/v1/companies/{slug}/postings?offset={offset}&limit={limit}"}', unixepoch() * 1000),
	('workday', 'Workday', '[]', '[".myworkdayjobs.com"]', true, 70, 20, '{"jobs":"https://{host}/wday/cxs/{tenant}/{site}/jobs"}', unixepoch() * 1000),
	('icims', 'iCIMS', '["careers.icims.com"]', '[".icims.com"]', false, 80, NULL, '{}', unixepoch() * 1000),
	('jobvite', 'Jobvite', '["jobs.jobvite.com"]', '[]', true, 90, NULL, '{"jobs":"https://jobs.jobvite.com/api/v2/job-feed/{slug}"}', unixepoch() * 1000),
	('linkedin', 'LinkedIn', '["linkedin.com","www.linkedin.com"]', '[]', false, 100, NULL, '{}', unixepoch() * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `source_domains` (`ats_type`, `pattern`, `enabled`, `supports_board_sync`, `priority`) VALUES
	('ashby', 'jobs.ashbyhq.com', true, true, 10),
	('greenhouse', 'boards.greenhouse.io', true, true, 20),
	('greenhouse', 'job-boards.greenhouse.io', true, true, 21),
	('lever', 'jobs.lever.co', true, true, 30),
	('bamboohr', 'jobs.bamboohr.com', true, true, 40),
	('workable', 'apply.workable.com', true, true, 50),
	('workable', 'careers.workable.com', true, true, 51),
	('smartrecruiters', 'jobs.smartrecruiters.com', true, true, 60),
	('workday', 'myworkdayjobs.com', true, true, 70),
	('icims', 'careers.icims.com', true, false, 80),
	('jobvite', 'jobs.jobvite.com', true, true, 90),
	('linkedin', 'linkedin.com/jobs/view', true, false, 100);
