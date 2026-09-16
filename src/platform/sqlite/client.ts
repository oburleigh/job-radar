/// <reference types="vite/client" />

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { acquireDatabaseLease } from "./database-lease";
import { resolveDatabasePath } from "./database-path";

const databasePath = resolveDatabasePath();
if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const databaseLease = databasePath === ":memory:" ? null : acquireDatabaseLease(databasePath);

let sqlite: Database.Database;
try {
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
} catch (error) {
  databaseLease?.release();
  throw error;
}

let closed = false;

export function closeDatabase(): void {
  if (closed) return;
  closed = true;
  try {
    sqlite.close();
  } finally {
    databaseLease?.release();
  }
}

if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", closeDatabase);
  import.meta.hot.dispose(closeDatabase);
}

export { databasePath, sqlite };
