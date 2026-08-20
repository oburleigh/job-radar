import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const databasePath = path.resolve(process.cwd(), process.env.DB_PATH ?? "data/job-radar.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export { databasePath, sqlite };
