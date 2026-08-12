INSERT OR IGNORE INTO `ats_integrations` (`ats_type`, `label`, `hostnames`, `host_suffixes`, `supports_board_sync`, `priority`, `page_size`, `endpoints`, `updated_at`) VALUES
	('web3-career', 'Web3 Career', '["web3.career","www.web3.career"]', '[]', false, 110, NULL, '{}', unixepoch() * 1000),
	('cryptocurrencyjobs', 'Cryptocurrency Jobs', '["cryptocurrencyjobs.co","www.cryptocurrencyjobs.co"]', '[]', false, 111, NULL, '{}', unixepoch() * 1000),
	('cryptojobslist', 'CryptoJobsList', '["cryptojobslist.com","www.cryptojobslist.com"]', '[]', false, 112, NULL, '{}', unixepoch() * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `source_domains` (`ats_type`, `pattern`, `enabled`, `supports_board_sync`, `priority`) VALUES
	('web3-career', 'web3.career', true, false, 110),
	('cryptocurrencyjobs', 'cryptocurrencyjobs.co', true, false, 111),
	('cryptojobslist', 'cryptojobslist.com', true, false, 112);
--> statement-breakpoint
UPDATE `search_profiles`
SET
	`max_age_days` = 90,
	`updated_at` = unixepoch() * 1000
WHERE `name` = 'UAE engineering leadership'
	AND `max_age_days` = 30;
