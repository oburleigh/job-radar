import { eq } from "drizzle-orm";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { db } from "@/db/client";
import { jobMatches, jobs, type searchProfiles } from "@/db/schema";

import { evaluateJob } from "./matching";

type ProfileRow = typeof searchProfiles.$inferSelect;

export interface EvaluationSummary {
  evaluated: number;
  matched: number;
  excluded: number;
}

interface EvaluationOptions {
  onBatch?: () => void;
  yieldEvery?: number;
}

export async function evaluateAndStore(
  profile: ProfileRow,
  options: EvaluationOptions = {},
): Promise<EvaluationSummary> {
  const activeJobs = db.select().from(jobs).where(eq(jobs.isActive, true)).all();
  const now = new Date();
  let matched = 0;
  let excluded = 0;
  const yieldEvery = options.yieldEvery ?? 25;

  for (const [index, job] of activeJobs.entries()) {
    const result = evaluateJob(
      {
        ...job,
        verified: Object.keys(job.rawPayload).length > 0,
      },
      profile,
      now,
    );
    matched += Number(result.status === "matched");
    excluded += Number(result.status === "excluded");
    db.insert(jobMatches)
      .values({
        profileId: profile.id,
        jobId: job.id,
        status: result.status,
        score: result.score,
        reasons: result.reasons,
        exclusionReasons: result.exclusionReasons,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [jobMatches.profileId, jobMatches.jobId],
        set: {
          status: result.status,
          score: result.score,
          reasons: result.reasons,
          exclusionReasons: result.exclusionReasons,
          updatedAt: now,
        },
      })
      .run();
    if ((index + 1) % yieldEvery === 0) {
      options.onBatch?.();
      await yieldToEventLoop();
    }
  }

  return { evaluated: activeJobs.length, matched, excluded };
}
