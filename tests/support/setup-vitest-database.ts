import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import { exportCurrentSchema, initializeCurrentSchema } from "~/scripts/database/current-schema";

export default function setupVitestDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "job-radar-vitest-"));
  const schemaPath = path.join(directory, "current-schema.sql");
  const schemaSql = exportCurrentSchema();
  writeFileSync(schemaPath, schemaSql);
  process.env.JOB_RADAR_TEST_SCHEMA_SQL = schemaPath;
  const databasePath = path.join(directory, "job-radar.sqlite");
  process.env.DB_PATH = databasePath;

  const sqlite = new Database(databasePath);
  const database = drizzle(sqlite, { schema });
  initializeCurrentSchema(database, schemaSql);
  bootstrapJobRadar(database);
  sqlite.close();

  return () => {
    rmSync(directory, { recursive: true, force: true });
  };
}
