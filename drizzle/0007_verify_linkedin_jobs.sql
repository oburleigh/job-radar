UPDATE `ats_integrations`
SET
	`endpoints` = '{"job":"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{externalId}"}',
	`updated_at` = unixepoch() * 1000
WHERE `ats_type` = 'linkedin';
