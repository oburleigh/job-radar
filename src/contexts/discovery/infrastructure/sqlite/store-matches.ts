import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { and, eq, gt, type SQL, sql } from "drizzle-orm";
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
import { screeningCountColumns } from "@/contexts/discovery/infrastructure/sqlite/screening-count-columns";

type ProfileRow = typeof searchProfiles.$inferSelect;
type Database = typeof db;

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

// Naming the columns is the point: `raw_payload` is the largest column in the table and nothing
// below consumes it. What the evaluation does need is `MatchableJob` plus the identifier the match
// is written against, the evidence that decides verification, and the three salary columns the
// published range is built from, so a column dropped from this list fails to type-check.
const evaluatedListingColumns = {
  id: jobs.id,
  title: jobs.title,
  locationText: jobs.locationText,
  locations: jobs.locations,
  description: jobs.description,
  department: jobs.department,
  workplaceType: jobs.workplaceType,
  publishedAt: jobs.publishedAt,
  evidence: jobs.evidence,
  salaryCurrency: jobs.salaryCurrency,
  salaryMin: jobs.salaryMin,
  salaryMax: jobs.salaryMax,
};

// A batch is read, then evaluated, so a listing can close while this run still has it in hand.
// Reading the flag inside the write keeps the copy on the match true at the moment the row lands,
// rather than restoring what was true when its batch was read. The conflict branch reuses
// `excluded`, which already holds this row's value, rather than seeking the listing a second time.
function listingActivityOf(jobId: number): SQL<boolean> {
  return sql`(SELECT ${jobs.isActive} FROM ${jobs} WHERE ${jobs.id} = ${jobId})`;
}

export async function evaluateAndStore(
  profile: ProfileRow,
  options: EvaluationOptions = {},
  database: Database = db,
): Promise<EvaluationSummary> {
  const now = new Date();
  const config = getJobRadarConfig(database);
  const yieldEvery = options.yieldEvery ?? config.discovery.workYieldBatchSize;
  // Paging by id over `jobs_active_id_idx` holds peak memory to one batch instead of the table. A
  // listing that closes before its batch is read is left to the pass that follows; the
  // `job_matches_follow_listing_activation` trigger keeps its stored flag in step meanwhile.
  const readListings = database
    .select(evaluatedListingColumns)
    .from(jobs)
    .where(and(eq(jobs.isActive, true), gt(jobs.id, sql.placeholder("afterId"))))
    .orderBy(jobs.id)
    .limit(sql.placeholder("batchSize"))
    .prepare();
  let evaluated = 0;
  let matched = 0;
  let excluded = 0;
  let afterId = 0;

  for (;;) {
    const batch = readListings.all({ afterId, batchSize: yieldEvery });
    if (batch.length === 0) {
      break;
    }
    options.beforeBatch?.();
    for (const job of batch) {
      const result = evaluateJob(
        {
          ...job,
          verified: isVerifiedJobListing(job.evidence),
          publishedSalary: createAnnualSalaryRange(
            job.salaryCurrency,
            job.salaryMin,
            job.salaryMax,
          ),
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
      const screeningCounts = screeningCountColumns(result.exclusionReasons);
      database
        .insert(jobMatches)
        .values({
          profileId: profile.id,
          jobId: job.id,
          status: result.status,
          score: result.score,
          reasons: result.reasons,
          exclusionReasons: result.exclusionReasons,
          ...screeningCounts,
          listingIsActive: listingActivityOf(job.id),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [jobMatches.profileId, jobMatches.jobId],
          set: {
            status: result.status,
            score: result.score,
            reasons: result.reasons,
            exclusionReasons: result.exclusionReasons,
            ...screeningCounts,
            listingIsActive: sql`excluded.${sql.raw(jobMatches.listingIsActive.name)}`,
            updatedAt: now,
          },
        })
        .run();
      evaluated += 1;
      afterId = job.id;
    }
    if (batch.length < yieldEvery) {
      break;
    }
    options.onBatch?.();
    await yieldToEventLoop();
  }

  return { evaluated, matched, excluded };
}
