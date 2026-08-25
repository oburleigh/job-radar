import "dotenv/config";

import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { migrateLegacyExclusionReasons } from "@/contexts/discovery/infrastructure/sqlite/migrate-legacy-exclusion-reasons";
import {
  hasStaleUnverifiedJobMatches,
  repairLegacyJobEvidence,
} from "@/contexts/discovery/infrastructure/sqlite/repair-legacy-job-evidence";
import { searchProfiles } from "@/contexts/discovery/infrastructure/sqlite/schema";
import { evaluateAndStore } from "@/contexts/discovery/infrastructure/sqlite/store-matches";

async function main() {
  migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  bootstrapJobRadar(db);

  const migratedExclusionReasons = migrateLegacyExclusionReasons(db);
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
      ? `Database schema and product defaults are ready. Migrated ${migratedExclusionReasons} legacy match records, repaired ${repairedJobs} legacy structured jobs, and re-evaluated saved profiles.`
      : `Database schema and product defaults are ready. Migrated ${migratedExclusionReasons} legacy match records.`,
  );
}

void main();
