import "dotenv/config";

import { and, eq, inArray } from "drizzle-orm";
import { fetchLinkedInJob } from "../src/contexts/discovery/infrastructure/job-sources/linkedin";
import { db } from "../src/contexts/discovery/infrastructure/sqlite/database";
import {
  jobMatches,
  jobs,
  searchProfiles,
} from "../src/contexts/discovery/infrastructure/sqlite/schema";
import { evaluateAndStore } from "../src/contexts/discovery/infrastructure/sqlite/store-matches";
import {
  deactivateSearchJob,
  upsertVerifiedSearchJob,
} from "../src/contexts/discovery/infrastructure/sqlite/store-search-result";

interface VerificationCounts {
  checked: number;
  verified: number;
  closed: number;
  notFound: number;
  unavailable: number;
  errors: number;
}

async function main() {
  const profileId = numberAfter(process.argv.slice(2), "--profile");
  const matchedJobIds = profileId
    ? db
        .select({ jobId: jobMatches.jobId })
        .from(jobMatches)
        .where(and(eq(jobMatches.profileId, profileId), eq(jobMatches.status, "matched")))
        .all()
        .map((match) => match.jobId)
    : [];
  const filters = [eq(jobs.atsType, "linkedin"), eq(jobs.isActive, true)];
  if (profileId && matchedJobIds.length === 0) {
    console.log(`Profile ${profileId} has no active LinkedIn matches.`);
    return;
  }
  const candidates = db
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      canonicalUrl: jobs.canonicalUrl,
    })
    .from(jobs)
    .where(profileId ? and(...filters, inArray(jobs.id, matchedJobIds)) : and(...filters))
    .all();
  const counts: VerificationCounts = {
    checked: 0,
    verified: 0,
    closed: 0,
    notFound: 0,
    unavailable: 0,
    errors: 0,
  };

  const queue = [...candidates];
  const workerCount = Math.min(3, queue.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      let candidate = queue.shift();
      while (candidate) {
        try {
          const lookup = await fetchLinkedInJob(candidate.externalId, candidate.canonicalUrl);
          counts.checked += 1;
          if (lookup.status === "verified") {
            upsertVerifiedSearchJob(lookup.job);
            counts.verified += 1;
          } else if (lookup.status === "closed" || lookup.status === "not_found") {
            deactivateSearchJob("linkedin", candidate.externalId);
            counts[lookup.status === "closed" ? "closed" : "notFound"] += 1;
          } else {
            counts.unavailable += 1;
          }
        } catch (error) {
          counts.errors += 1;
          console.error(
            `LinkedIn ${candidate.externalId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        candidate = queue.shift();
      }
    }),
  );

  const profiles = db.select().from(searchProfiles).all();
  for (const profile of profiles) {
    await evaluateAndStore(profile);
  }

  console.log(
    [
      `Checked ${counts.checked} LinkedIn jobs`,
      `${counts.verified} active`,
      `${counts.closed} closed`,
      `${counts.notFound} removed`,
      `${counts.unavailable} unavailable`,
      `${counts.errors} errors`,
      `reevaluated ${profiles.length} profiles`,
    ].join(", "),
  );
}

function numberAfter(values: string[], flag: string): number | undefined {
  const index = values.indexOf(flag);
  const value = index >= 0 ? values[index + 1] : undefined;
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

void main();
