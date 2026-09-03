import { sql } from "drizzle-orm";

import type { db } from "./database";
import { jobMatches, jobs } from "./schema";

type Database = typeof db;

const listingActivity = sql`(SELECT ${jobs.isActive} FROM ${jobs} WHERE ${jobs.id} = ${jobMatches.jobId})`;

// `job_matches.listing_is_active` copies `jobs.is_active` so the screening summary reads one index
// range instead of materialising every active job id. A trigger keeps it in step from then on; this
// answers for rows written before the column existed, and reports zero once they agree.
export function backfillJobMatchListingActivity(database: Database): number {
  return database
    .update(jobMatches)
    .set({ listingIsActive: sql`${listingActivity}` })
    .where(sql`${jobMatches.listingIsActive} <> ${listingActivity}`)
    .run().changes;
}
