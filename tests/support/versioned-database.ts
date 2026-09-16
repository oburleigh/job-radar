import type Database from "better-sqlite3";

import type { MigrationStep } from "@/contexts/discovery/infrastructure/sqlite/migrations/coordinator";
import { LEGACY_VERSION_ZERO_FINGERPRINT } from "@/contexts/discovery/infrastructure/sqlite/migrations/current-version";
import { migrateOpportunityTrackingFromVersionOne } from "@/contexts/opportunity-tracking/infrastructure/sqlite/migrate-version-one";

const opportunityTrackingTables = [
  "advisor_executions",
  "relationship_plans",
  "opportunity_assessments",
  "application_recommendations",
  "next_actions",
  "application_timeline",
  "applications",
  "advisor_settings",
] as const;

export const versionOneToTwoMigration: MigrationStep = {
  fromVersion: 1,
  toVersion: 2,
  sourceFingerprint: LEGACY_VERSION_ZERO_FINGERPRINT,
  migrate: migrateOpportunityTrackingFromVersionOne,
};

export function initializeVersionZeroDatabase(
  sqlite: Database.Database,
  currentSchemaSql: string,
): void {
  sqlite.exec(currentSchemaSql);
  for (const table of opportunityTrackingTables) sqlite.exec(`DROP TABLE ${table}`);
  sqlite.pragma("user_version = 0");
}
