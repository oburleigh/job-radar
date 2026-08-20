import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../src/infrastructure/database/schema";

export default function setupVitestDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "job-radar-vitest-"));
  const databasePath = path.join(directory, "job-radar.sqlite");
  process.env.DB_PATH = databasePath;

  const sqlite = new Database(databasePath);
  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  sqlite.close();

  return () => {
    rmSync(directory, { recursive: true, force: true });
  };
}
