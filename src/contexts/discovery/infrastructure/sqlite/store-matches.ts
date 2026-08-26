import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import { currencyFrom } from "@/contexts/discovery/domain/currency";
import { evaluateJob } from "@/contexts/discovery/domain/evaluate-job";
import { isVerifiedJobListing } from "@/contexts/discovery/domain/job-listing-provenance";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  jobMatches,
  jobs,
  type searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

type ProfileRow = typeof searchProfiles.$inferSelect;

export interface EvaluationSummary {
  evaluated: number;
  matched: number;
  excluded: number;
}

interface EvaluationOptions {
  locationTerms?: readonly string[];
  excludedLocationTerms?: readonly string[];
  onBatch?: () => void;
  beforeBatch?: () => void;
  yieldEvery?: number;
}

export async function evaluateAndStore(
  profile: ProfileRow,
  options: EvaluationOptions = {},
): Promise<EvaluationSummary> {
  const activeJobs = db.select().from(jobs).where(eq(jobs.isActive, true)).all();
  const now = new Date();
  const config = getJobRadarConfig();
  let matched = 0;
  let excluded = 0;
  const yieldEvery = options.yieldEvery ?? config.discovery.workYieldBatchSize;

  for (const [index, job] of activeJobs.entries()) {
    if (index % yieldEvery === 0) {
      options.beforeBatch?.();
    }
    const result = evaluateJob(
      {
        ...job,
        verified: isVerifiedJobListing(job.evidence),
        publishedSalary: createAnnualSalaryRange(job.salaryCurrency, job.salaryMin, job.salaryMax),
      },
      {
        ...profile,
        locationTerms: [...(options.locationTerms ?? profile.locationTerms)],
        excludedLocationTerms: [
          ...(options.excludedLocationTerms ?? profile.excludedLocationTerms),
        ],
        salaryCurrency: currencyFrom(profile.salaryCurrency),
      },
      config.matching,
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
