UPDATE `search_profiles`
SET
  `excluded_title_terms` = '["Intern","Graduate","Associate","Assistant","Security Clearance","Civil","Drainage","Water","Highway","Rail","Structural","Construction","Mechanical"]',
  `updated_at` = unixepoch() * 1000
WHERE `name` = 'UK platform and infrastructure IC';
