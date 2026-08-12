UPDATE `ats_integrations`
SET
	`endpoints` = json_set(`endpoints`, '$.jobs', 'https://jobs.jobvite.com/{slug}/jobs/viewall'),
	`updated_at` = unixepoch() * 1000
WHERE `ats_type` = 'jobvite';
