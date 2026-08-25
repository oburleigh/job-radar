import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

const fixtureTimestamp = new Date("2026-08-25T12:00:00.000Z");

export function seedPerformanceDatabase(databasePath: string): { profileId: number } {
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite);

  try {
    const profileId = database
      .insert(searchProfiles)
      .values({
        name: "Performance fixture",
        titleTerms: ["staff platform engineer"],
        locationTerms: ["remote"],
        requiredJobTerms: ["platform"],
        excludedTitleTerms: [],
        excludedLocationTerms: [],
        excludedDescriptionTerms: [],
        includeRemote: true,
        includeUnverified: false,
        salaryCurrency: "USD",
        maxAgeDays: 30,
        minScore: 70,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      })
      .returning({ id: searchProfiles.id })
      .get().id;

    for (let index = 1; index <= 20; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const jobId = database
        .insert(jobs)
        .values({
          atsType: "greenhouse",
          externalId: `performance-${suffix}`,
          dedupeKey: `performance-fixture-${suffix}`,
          canonicalUrl: `https://example.test/jobs/performance-${suffix}`,
          applyUrl: `https://example.test/jobs/performance-${suffix}/apply`,
          companyName: `Fixture Company ${suffix}`,
          title: `Staff Platform Engineer ${suffix}`,
          locationText: "Remote, United States",
          locations: ["Remote, United States"],
          description: "Build and operate a reliable platform for product teams.",
          department: "Engineering",
          employmentType: "Full-time",
          workplaceType: "Remote",
          publishedAt: fixtureTimestamp,
          salaryCurrency: "USD",
          salaryMin: 180_000,
          salaryMax: 220_000,
          evidence: "structured",
          firstSeenAt: fixtureTimestamp,
          lastSeenAt: fixtureTimestamp,
          rawPayload: {},
        })
        .returning({ id: jobs.id })
        .get().id;

      database
        .insert(jobMatches)
        .values({
          profileId,
          jobId,
          status: "matched",
          score: 100 - index,
          reasons: [
            { code: "title-match", term: "staff platform engineer" },
            { code: "remote-allowed" },
          ],
          exclusionReasons: [],
          updatedAt: fixtureTimestamp,
        })
        .run();
    }

    return { profileId };
  } finally {
    sqlite.close();
  }
}
