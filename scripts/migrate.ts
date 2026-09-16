import "dotenv/config";

import { migrateDatabase } from "@/contexts/discovery/infrastructure/sqlite/migrations/coordinator";
import { LEGACY_VERSION_ZERO_FINGERPRINT } from "@/contexts/discovery/infrastructure/sqlite/migrations/current-version";
import { migrateOpportunityTrackingFromVersionOne } from "@/contexts/opportunity-tracking/infrastructure/sqlite/migrate-version-one";
import { resolveDatabasePath } from "@/platform/sqlite/database-path";
import { exportCurrentSchema, initializeCurrentSchema } from "~/scripts/database/current-schema";

async function main() {
  const databasePath = resolveDatabasePath();
  const currentSchemaSql = exportCurrentSchema();
  if (databasePath !== ":memory:") {
    await migrateDatabase({
      databasePath,
      currentSchemaSql,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          sourceFingerprint: LEGACY_VERSION_ZERO_FINGERPRINT,
          migrate: migrateOpportunityTrackingFromVersionOne,
        },
      ],
    });
  }
  const [
    { bootstrapJobRadar },
    { backfillJobMatchListingActivity },
    { db },
    { backfillScreeningCountColumns, migrateLegacyExclusionReasons },
    { hasStaleUnverifiedJobMatches, repairLegacyJobEvidence },
    { searchProfiles },
    { evaluateAndStore },
    { bootstrapAdvisorSettings },
    { opportunityTrackingDatabase },
    { bootstrapRecruiterResearch },
  ] = await Promise.all([
    import("@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar"),
    import("@/contexts/discovery/infrastructure/sqlite/backfill-listing-activity"),
    import("@/contexts/discovery/infrastructure/sqlite/database"),
    import("@/contexts/discovery/infrastructure/sqlite/migrate-legacy-exclusion-reasons"),
    import("@/contexts/discovery/infrastructure/sqlite/repair-legacy-job-evidence"),
    import("@/contexts/discovery/infrastructure/sqlite/schema"),
    import("@/contexts/discovery/infrastructure/sqlite/store-matches"),
    import("@/contexts/opportunity-tracking/infrastructure/sqlite/advisor-settings"),
    import("@/contexts/opportunity-tracking/infrastructure/sqlite/database"),
    import("@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research"),
  ]);
  if (databasePath === ":memory:") initializeCurrentSchema(db, currentSchemaSql);
  bootstrapJobRadar(db);
  bootstrapAdvisorSettings(opportunityTrackingDatabase);
  bootstrapRecruiterResearch(db);

  const migratedExclusionReasons = migrateLegacyExclusionReasons(db);
  const backfilledScreeningCounts = backfillScreeningCountColumns(db);
  const backfilledListingActivity = backfillJobMatchListingActivity(db);
  const repairedJobs = repairLegacyJobEvidence(db);
  const recoveringStaleMatches = repairedJobs === 0 && hasStaleUnverifiedJobMatches(db);
  if (repairedJobs > 0 || recoveringStaleMatches) {
    const profiles = db.select().from(searchProfiles).all();
    console.log(
      repairedJobs > 0
        ? `Repaired ${repairedJobs} legacy structured jobs. Re-evaluating ${profiles.length} saved profiles.`
        : `Found stale unverified matches for structured jobs. Re-evaluating ${profiles.length} saved profiles.`,
    );
    for (const profile of profiles) {
      const summary = await evaluateAndStore(profile);
      console.log(
        `Re-evaluated profile ${profile.id}: ${summary.matched} of ${summary.evaluated} active jobs matched.`,
      );
    }
  }

  console.log(
    repairedJobs > 0
      ? `Database schema and product defaults are ready. Migrated ${migratedExclusionReasons} legacy match records, backfilled ${backfilledScreeningCounts} screening summaries and ${backfilledListingActivity} listing activity flags, repaired ${repairedJobs} legacy structured jobs, and re-evaluated saved profiles.`
      : `Database schema and product defaults are ready. Migrated ${migratedExclusionReasons} legacy match records, backfilled ${backfilledScreeningCounts} screening summaries, and brought ${backfilledListingActivity} listing activity flags into step.`,
  );
}

void main();
