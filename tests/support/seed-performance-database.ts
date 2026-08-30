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
        locationTerms: ["United Arab Emirates"],
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

    if (process.env.JOB_RADAR_PERFORMANCE_FIXTURE === "workspace-scale") {
      seedWorkspaceScale(sqlite, profileId);
    }

    return { profileId };
  } finally {
    sqlite.close();
  }
}

function seedWorkspaceScale(sqlite: Database.Database, profileId: number): void {
  const timestamp = fixtureTimestamp.getTime();
  const insertProfile = sqlite.prepare(`
    INSERT INTO search_profiles
      (name, title_terms, location_terms, required_job_terms, excluded_title_terms,
       excluded_location_terms, excluded_description_terms, include_remote, include_unverified,
       salary_currency, max_age_days, min_score, enabled, created_at, updated_at)
    VALUES (?, '["engineering"]', '["United Arab Emirates"]', '[]', '[]', '[]', '[]',
      0, 0, 'USD', 30, 70, 1, ?, ?)
  `);
  const insertSource = sqlite.prepare(`
    INSERT INTO source_domains
      (ats_type, pattern, enabled, supports_board_sync, priority)
    VALUES ('greenhouse', ?, 1, 1, ?)
  `);
  const insertBoard = sqlite.prepare(`
    INSERT INTO company_boards
      (ats_type, canonical_key, company_name, slug, base_url, config, enabled, discovered_at)
    VALUES ('greenhouse', ?, ?, ?, ?, '{}', 1, ?)
  `);
  const insertRun = sqlite.prepare(`
    INSERT INTO discovery_runs
      (profile_id, provider, status, phase, known_board_count, known_board_completed_count,
       known_board_success_count, web_coverage_status, query_count, hit_count, boards_discovered,
       jobs_upserted, matches_found, started_at, finished_at)
    VALUES (?, 'serper', 'completed', 'matching', 946, 946, 940, 'completed', 8, 420, 2,
      548, 12, ?, ?)
  `);
  const insertJob = sqlite.prepare(`
    INSERT INTO jobs
      (ats_type, external_id, dedupe_key, canonical_url, company_name, title, location_text,
       locations, description, department, employment_type, workplace_type, published_at,
       evidence, first_seen_at, last_seen_at, is_active, raw_payload)
    VALUES ('greenhouse', ?, ?, ?, 'Excluded Fixture Company', 'Excluded engineering role',
      'Dubai, United Arab Emirates', '["Dubai, United Arab Emirates"]', '', 'Engineering',
      'Full-time', 'On-site', ?, 'structured', ?, ?, 1, '{}')
  `);
  const insertMatch = sqlite.prepare(`
    INSERT INTO job_matches
      (profile_id, job_id, status, score, reasons, exclusion_reasons,
       excluded_title_reason_count, excluded_location_reason_count, stale_reason_count,
       unverified_reason_count, context_reason_count, salary_reason_count, updated_at)
    VALUES (?, ?, 'excluded', 0, '[]', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const exclusionReasons = [
    { reasons: '[{"code":"title-mismatch"}]', counts: [1, 0, 0, 0, 0, 0] },
    { reasons: '[{"code":"location-mismatch"}]', counts: [0, 1, 0, 0, 0, 0] },
    { reasons: '[{"code":"stale-listing","maximumAgeDays":30}]', counts: [0, 0, 1, 0, 0, 0] },
    { reasons: '[{"code":"unverified-lead"}]', counts: [0, 0, 0, 1, 0, 0] },
    { reasons: '[{"code":"missing-required-job-term"}]', counts: [0, 0, 0, 0, 1, 0] },
    {
      reasons: '[{"code":"excluded-title"},{"code":"excluded-location"}]',
      counts: [1, 1, 0, 0, 0, 0],
    },
  ] as const;

  sqlite.transaction(() => {
    for (let index = 2; index <= 5; index += 1) {
      insertProfile.run(`Performance fixture ${index}`, timestamp, timestamp);
    }
    for (let index = 1; index <= 15; index += 1) {
      insertSource.run(`source-${index}.example.test`, index);
    }
    for (let index = 1; index <= 946; index += 1) {
      const suffix = String(index).padStart(3, "0");
      insertBoard.run(
        `greenhouse:fixture-${suffix}`,
        `Fixture Company ${suffix}`,
        `fixture-${suffix}`,
        `https://boards.example.test/fixture-${suffix}`,
        timestamp,
      );
    }
    for (let index = 0; index < 54; index += 1) {
      const startedAt = timestamp - index * 60_000;
      insertRun.run(profileId, startedAt, startedAt + 30_000);
    }
    for (let index = 1; index <= 80_000; index += 1) {
      const externalId = `excluded-${index}`;
      const jobId = Number(
        insertJob.run(
          externalId,
          `performance-fixture-${externalId}`,
          `https://example.test/jobs/${externalId}`,
          timestamp,
          timestamp,
          timestamp,
        ).lastInsertRowid,
      );
      const exclusion = exclusionReasons[(index - 1) % exclusionReasons.length];
      if (!exclusion) {
        throw new Error("The performance exclusion fixture must cover every inserted match.");
      }
      insertMatch.run(profileId, jobId, exclusion.reasons, ...exclusion.counts, timestamp);
    }
  })();
}
