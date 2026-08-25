import { and, eq, isNotNull, sql } from "drizzle-orm";

import type { db } from "./database";
import { jobMatches, jobs } from "./schema";

type Database = typeof db;

export function repairLegacyJobEvidence(database: Database): number {
  const result = database
    .update(jobs)
    .set({ evidence: "structured" })
    .where(
      and(
        eq(jobs.evidence, "search-lead"),
        isNotNull(jobs.boardId),
        sql`EXISTS (
          SELECT 1
          FROM json_each(
            CASE
              WHEN json_valid(${jobs.rawPayload}) THEN ${jobs.rawPayload}
              ELSE '{}'
            END
          ) AS payload_entry
          WHERE payload_entry.key <> 'verification'
        )`,
      ),
    )
    .run();

  return result.changes;
}

export function hasStaleUnverifiedJobMatches(database: Database): boolean {
  return Boolean(
    database
      .select({ id: jobMatches.id })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
      .where(
        and(
          eq(jobs.evidence, "structured"),
          eq(jobs.isActive, true),
          sql`instr(${jobMatches.exclusionReasons}, '"unverified-lead"') > 0`,
          sql`EXISTS (
            SELECT 1
            FROM json_each(${jobMatches.exclusionReasons}) AS exclusion_reason
            WHERE exclusion_reason.value = 'unverified-lead'
               OR json_extract(
                    CASE
                      WHEN json_valid(exclusion_reason.value) THEN exclusion_reason.value
                      ELSE '{}'
                    END,
                    '$.code'
                  ) = 'unverified-lead'
          )`,
        ),
      )
      .limit(1)
      .get(),
  );
}
