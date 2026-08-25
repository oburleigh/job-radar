import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { evaluateJob } from "@/contexts/discovery/domain/evaluate-job";
import { isVerifiedJobListing } from "@/contexts/discovery/domain/job-listing-provenance";
import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { classifyUrlWithConfig } from "@/contexts/discovery/infrastructure/job-sources/url-classification";
import { getDashboardData } from "@/contexts/discovery/infrastructure/sqlite/read-models/dashboard";
import * as schema from "@/contexts/discovery/infrastructure/sqlite/schema";
import {
  atsIntegrations,
  jobMatches,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

import type { DiscoveryBenchmarkCorpus } from "./corpus";
import {
  createDiscoveryBenchmarkReport,
  type DiscoveryBenchmarkObservation,
} from "./discovery-benchmark";

export function runDiscoveryBenchmark(corpus: DiscoveryBenchmarkCorpus) {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });

  try {
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    bootstrapJobRadar(database, corpus.benchmarkedAt);
    const integrationConfig = Object.fromEntries(
      database
        .select({
          atsType: atsIntegrations.atsType,
          hostnames: atsIntegrations.hostnames,
          hostSuffixes: atsIntegrations.hostSuffixes,
          priority: atsIntegrations.priority,
        })
        .from(atsIntegrations)
        .all()
        .map((integration) => [integration.atsType, integration]),
    );
    const profileIds = new Map<string, number>();

    for (const profile of corpus.profiles) {
      const profileId = database
        .insert(searchProfiles)
        .values({
          name: profile.name,
          titleTerms: [...profile.criteria.titleTerms],
          locationTerms: [...profile.criteria.locationTerms],
          requiredJobTerms: [...profile.criteria.requiredJobTerms],
          excludedTitleTerms: [...profile.criteria.excludedTitleTerms],
          excludedLocationTerms: [...profile.criteria.excludedLocationTerms],
          excludedDescriptionTerms: [...profile.criteria.excludedDescriptionTerms],
          includeRemote: profile.criteria.includeRemote,
          includeUnverified: profile.criteria.includeUnverified,
          salaryCurrency: profile.criteria.salaryCurrency ?? "",
          salaryMin: profile.criteria.salaryMin,
          salaryMax: profile.criteria.salaryMax,
          maxAgeDays: profile.criteria.maxAgeDays,
          minScore: profile.criteria.minScore,
          enabled: true,
          createdAt: corpus.benchmarkedAt,
          updatedAt: corpus.benchmarkedAt,
        })
        .returning({ id: searchProfiles.id })
        .get().id;
      profileIds.set(profile.name, profileId);
    }

    const evaluated = corpus.examples.map((example) => {
      const profile = corpus.profiles.find((candidate) => candidate.name === example.profile);
      const profileId = profileIds.get(example.profile);
      if (!profile || profileId === undefined) {
        throw new Error(
          `Benchmark example ${example.id} references unknown profile ${example.profile}`,
        );
      }
      const classification = example.providerReturned
        ? classifyUrlWithConfig(example.url, integrationConfig)
        : null;
      const verified = isVerifiedJobListing(example.evidence);
      const verification = !example.active
        ? ("inactive" as const)
        : verified
          ? ("verified" as const)
          : ("unverified" as const);
      const match = example.active
        ? evaluateJob(
            { ...example.job, verified },
            profile.criteria,
            corpus.policy,
            corpus.benchmarkedAt,
          )
        : null;
      const canonicalUrl = classification?.canonicalUrl ?? example.url;
      const jobId = database
        .insert(jobs)
        .values({
          atsType: classification?.atsType ?? example.source,
          externalId: classification?.externalId ?? example.id,
          dedupeKey: `discovery-benchmark:${example.id}`,
          canonicalUrl,
          applyUrl: canonicalUrl,
          companyName: "Benchmark Company",
          title: example.job.title,
          locationText: example.job.locationText,
          locations: [...example.job.locations],
          description: example.job.description,
          department: example.job.department,
          employmentType: "Full-time",
          workplaceType: example.job.workplaceType,
          publishedAt: example.job.publishedAt,
          salaryCurrency: example.job.publishedSalary?.currency ?? "",
          salaryMin: example.job.publishedSalary?.min ?? null,
          salaryMax: example.job.publishedSalary?.max ?? null,
          evidence: example.evidence,
          firstSeenAt: corpus.benchmarkedAt,
          lastSeenAt: corpus.benchmarkedAt,
          isActive: example.active,
          rawPayload: { benchmarkExample: example.id },
        })
        .returning({ id: jobs.id })
        .get().id;
      if (match) {
        database
          .insert(jobMatches)
          .values({
            profileId,
            jobId,
            status: match.status,
            score: match.score,
            reasons: match.reasons,
            exclusionReasons: match.exclusionReasons,
            updatedAt: corpus.benchmarkedAt,
          })
          .run();
      }

      return { example, profile, profileId, classification, verification, match, canonicalUrl };
    });

    const visibleRanks = new Map<string, number>();
    for (const profile of corpus.profiles) {
      const profileId = profileIds.get(profile.name);
      if (profileId === undefined) {
        continue;
      }
      getDashboardData({ profileId }, database).jobs.forEach((job, index) => {
        visibleRanks.set(profileJobKey(profileId, job.canonicalUrl), index + 1);
      });
    }

    const observations: DiscoveryBenchmarkObservation[] = evaluated.map(
      ({ example, profile, profileId, classification, verification, match, canonicalUrl }) => ({
        id: example.id,
        profile: profile.name,
        market: profile.market,
        track: profile.track,
        source: example.source,
        expectedVerification: example.expectedVerification,
        expectedMatch: example.expectedMatch,
        expectedVisible: example.expectedVisible,
        retrieved: example.providerReturned,
        classified: classification?.atsType === example.source,
        verification,
        match: match?.status ?? "not-evaluated",
        visibleRank: visibleRanks.get(profileJobKey(profileId, canonicalUrl)) ?? null,
      }),
    );

    return createDiscoveryBenchmarkReport(corpus.profiles, observations);
  } finally {
    sqlite.close();
  }
}

function profileJobKey(profileId: number, canonicalUrl: string): string {
  return `${profileId}|${canonicalUrl}`;
}
