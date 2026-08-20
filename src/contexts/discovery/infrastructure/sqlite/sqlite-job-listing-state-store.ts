import type { JobListingStateStore } from "@/contexts/discovery/application/job-listings/change-state/port";
import type { db } from "./database";
import { jobStates } from "./schema";

type Database = typeof db;

export function createSqliteJobListingStateStore(database: Database): JobListingStateStore {
  return {
    save(command, changedAt) {
      database
        .insert(jobStates)
        .values({
          profileId: command.profileId,
          jobId: command.jobId,
          status: command.state,
          notes: "",
          updatedAt: changedAt,
        })
        .onConflictDoUpdate({
          target: [jobStates.profileId, jobStates.jobId],
          set: { status: command.state, updatedAt: changedAt },
        })
        .run();
    },
  };
}
