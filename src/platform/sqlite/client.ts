import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const configuredDatabasePath = process.env.DB_PATH ?? "data/job-radar.sqlite";
const databasePath =
  configuredDatabasePath === ":memory:"
    ? configuredDatabasePath
    : path.resolve(process.cwd(), configuredDatabasePath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export { databasePath, sqlite };
