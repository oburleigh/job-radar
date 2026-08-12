UPDATE `search_profiles`
SET
	`required_job_terms` = '["Software","Software developer","Application development","Cloud","DevOps","Site reliability","Artificial intelligence","Machine learning","Programming","Coding","Technology platform","Digital product","Technical architecture","Distributed systems","E-commerce","Fintech","Cybersecurity","Java","Node.js","Python"]',
	`excluded_description_terms` = '["United States only","US only","must be based in the US","Hotel","Hospitality","Facilities management","Investment professional"]',
	`include_unverified` = false,
	`updated_at` = unixepoch() * 1000
WHERE `name` IN ('UAE engineering leadership', 'UK engineering leadership');
