import { readFileSync } from "node:fs";
import { initializeCurrentSchema } from "~/scripts/database/current-schema";

export function initializeTestSchema(
  database: Parameters<typeof initializeCurrentSchema>[0],
): void {
  const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
  if (!schemaPath) {
    throw new Error("The test database setup must export the current schema first.");
  }
  initializeCurrentSchema(database, readFileSync(schemaPath, "utf8"));
}
