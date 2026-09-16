import { and, desc, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  AdvisorExecutionFinish,
  AdvisorExecutionRecord,
  AdvisorExecutionStart,
} from "@/contexts/opportunity-tracking/application/advisor-history";
import type * as schema from "./schema";
import { advisorExecutions } from "./schema";

export function createSqliteAdvisorHistory(database: BetterSQLite3Database<typeof schema>) {
  return {
    start(record: AdvisorExecutionStart): number {
      return database.transaction((transaction) => {
        const previous = transaction
          .select()
          .from(advisorExecutions)
          .where(
            and(
              eq(advisorExecutions.kind, record.kind),
              eq(advisorExecutions.searchProfileId, record.searchProfileId),
              eq(advisorExecutions.jobListingId, record.jobListingId),
              record.applicationId === null
                ? isNull(advisorExecutions.applicationId)
                : eq(advisorExecutions.applicationId, record.applicationId),
            ),
          )
          .orderBy(desc(advisorExecutions.id))
          .get();
        const retryOf =
          previous && previous.status !== "running" && previous.status !== "completed"
            ? previous.id
            : null;
        return transaction
          .insert(advisorExecutions)
          .values({ ...record, status: "running", retryOf })
          .returning({ id: advisorExecutions.id })
          .get().id;
      });
    },
    finish(record: AdvisorExecutionFinish): void {
      const updated = database
        .update(advisorExecutions)
        .set({ status: record.status, reason: record.reason, finishedAt: record.finishedAt })
        .where(and(eq(advisorExecutions.id, record.id), eq(advisorExecutions.status, "running")))
        .run();
      if (updated.changes !== 1)
        throw new Error("Advisor execution is missing or already finished.");
    },
    latest(
      owner: Pick<
        AdvisorExecutionStart,
        "kind" | "searchProfileId" | "jobListingId" | "applicationId"
      >,
    ): AdvisorExecutionRecord | undefined {
      return database
        .select()
        .from(advisorExecutions)
        .where(
          and(
            eq(advisorExecutions.kind, owner.kind),
            eq(advisorExecutions.searchProfileId, owner.searchProfileId),
            eq(advisorExecutions.jobListingId, owner.jobListingId),
            owner.applicationId === null
              ? isNull(advisorExecutions.applicationId)
              : eq(advisorExecutions.applicationId, owner.applicationId),
          ),
        )
        .orderBy(desc(advisorExecutions.startedAt), desc(advisorExecutions.id))
        .limit(1)
        .get();
    },
    list(limit: number): readonly AdvisorExecutionRecord[] {
      return database
        .select()
        .from(advisorExecutions)
        .orderBy(desc(advisorExecutions.startedAt), desc(advisorExecutions.id))
        .limit(limit)
        .all();
    },
  };
}
