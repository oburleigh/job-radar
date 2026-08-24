import { describe, expect, it } from "vitest";

import { createAnnualSalaryRange } from "./annual-salary";
import { currencyFrom } from "./currency";
import { createJobMatcher } from "./evaluate-job";
import type { JobMatchingCriteria, MatchableJob, MatchingPolicy } from "./job-match";

const matchingPolicy: MatchingPolicy = {
  exactTitleScore: 60,
  fullTokenScore: 50,
  partialTokenScore: 42,
  partialTokenThreshold: 0.8,
  locationScore: 30,
  remoteScore: 25,
  unknownDateScore: 5,
  freshnessMaxScore: 10,
  freshnessMinimumScore: 2,
  freshnessStepDays: 3,
  stopWords: ["a", "an", "and", "of", "the", "to"],
  genericTitleTerms: [
    "head",
    "vp",
    "vice",
    "president",
    "director",
    "senior",
    "manager",
    "principal",
    "chief",
    "lead",
  ],
  remoteTerms: ["remote"],
  unrestrictedRemotePhrases: [
    "work from anywhere",
    "anywhere in the world",
    "work remotely from anywhere",
    "globally remote",
    "global remote",
    "worldwide remote",
    "remote worldwide",
    "location agnostic",
  ],
};

const evaluateJob = createJobMatcher(matchingPolicy);

const profile: JobMatchingCriteria = {
  titleTerms: ["Head of Engineering", "Director of Engineering"],
  locationTerms: ["Dubai", "UAE"],
  requiredJobTerms: [],
  excludedTitleTerms: ["Assistant"],
  excludedLocationTerms: [],
  excludedDescriptionTerms: ["US only"],
  includeRemote: false,
  includeUnverified: false,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  maxAgeDays: 30,
  minScore: 70,
};

const baseJob: MatchableJob = {
  title: "Head of Engineering",
  locationText: "Dubai, United Arab Emirates",
  locations: ["Dubai"],
  description: "Lead a multi-disciplinary engineering organization.",
  department: "Engineering",
  workplaceType: "hybrid",
  verified: true,
  publishedAt: new Date("2026-07-25T00:00:00Z"),
  publishedSalary: null,
};

describe("deterministic matching", () => {
  it("matches a recent target title in the target location", () => {
    const result = evaluateJob(baseJob, profile, new Date("2026-07-29T00:00:00Z"));

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("rejects a role outside the configured location", () => {
    const result = evaluateJob(
      { ...baseJob, locationText: "London", locations: ["London"] },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "location-mismatch" });
  });

  it("applies explicit exclusion terms before scoring", () => {
    const result = evaluateJob(
      { ...baseJob, title: "Assistant Head of Engineering" },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "excluded-title", term: "Assistant" });
  });

  it("applies context exclusions when the phrase appears in the title", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Principal Platform Engineer - security clearance required",
      },
      {
        ...profile,
        titleTerms: ["Principal Platform Engineer"],
        excludedDescriptionTerms: ["Security clearance required"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({
      code: "excluded-description",
      term: "Security clearance required",
    });
  });

  it("does not confuse a generic senior manager role with engineering leadership", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Senior Technical Program Manager",
      },
      {
        ...profile,
        titleTerms: ["Senior Engineering Manager"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "title-mismatch" });
  });

  it("does not treat a description mention as the job location", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        locationText: "San Francisco, California, United States",
        locations: ["San Francisco"],
        description: "We also have offices in London and Dubai.",
      },
      {
        ...profile,
        locationTerms: ["London", "Dubai"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "location-mismatch" });
  });

  it("supports an optional positive keyword filter for ambiguous industries", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Engineering Director",
        description: "Lead civil and cable engineering delivery.",
        department: "Transmission",
      },
      {
        ...profile,
        titleTerms: ["Engineering Director"],
        requiredJobTerms: ["Software", "Technology", "Platform"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "missing-required-job-term" });
  });

  it("keeps unverified search-engine pages out unless the profile opts in", () => {
    const result = evaluateJob(
      { ...baseJob, verified: false },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "unverified-lead" });
  });

  it("rejects remote roles restricted to a different country", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        locationText: "100% Remote within Poland",
        locations: ["Poland"],
        workplaceType: "Remote",
      },
      {
        ...profile,
        locationTerms: ["London", "UK", "United Kingdom"],
        includeRemote: true,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "location-mismatch" });
  });

  it("rejects an ambiguous target city when the profile excludes its country", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        locationText: "London, Ontario, Canada",
        locations: ["London, Ontario, Canada"],
      },
      {
        ...profile,
        locationTerms: ["London", "UK", "United Kingdom"],
        excludedLocationTerms: ["Canada", "United States"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "excluded-location", term: "Canada" });
  });

  it("accepts location-agnostic remote roles when enabled", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        locationText: "Remote",
        locations: [],
        workplaceType: "Remote",
      },
      {
        ...profile,
        locationTerms: ["London", "UK", "United Kingdom"],
        includeRemote: true,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 94,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "remote-allowed" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("accepts an explicitly worldwide role with a nominal office location", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Head of Engineering (Remote - Work from Anywhere)",
        locationText: "Gibraltar - Remote",
        locations: ["Gibraltar - Remote"],
        workplaceType: "",
        description: "This is a full time, 100% remote position. Work from anywhere!",
      },
      {
        ...profile,
        includeRemote: true,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
    expect(result.reasons).toContainEqual({ code: "remote-allowed" });
  });

  it("accepts remote roles explicitly located in the target country", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        locationText: "Remote, United Kingdom",
        locations: ["United Kingdom"],
        workplaceType: "Remote",
      },
      {
        ...profile,
        locationTerms: ["London", "UK", "United Kingdom"],
        includeRemote: true,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
    expect(result.reasons).toContainEqual({ code: "location-match", term: "United Kingdom" });
  });

  it("does not treat International as the excluded title Intern", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Director, AI Engineering - International",
        locationText: "Remote Dubai",
        locations: ["Remote Dubai"],
      },
      {
        ...profile,
        titleTerms: ["Director of AI Engineering"],
        excludedTitleTerms: ["Intern"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
  });

  it("does not match target words scattered across an unrelated title", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        title: "Senior Backend Engineer, AI Engineering: Duo Agent Platform Tools",
      },
      {
        ...profile,
        titleTerms: ["AI Platform Engineer"],
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({ code: "title-mismatch" });
  });

  it("does not award a full title score when all target words appear in the wrong order", () => {
    const result = evaluateJob(
      { ...baseJob, title: "Engineer AI Platform" },
      { ...profile, titleTerms: ["AI Platform Engineer"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "title-mismatch" }],
    });
  });

  it("awards the full-token score when target words stay ordered but are not consecutive", () => {
    const result = evaluateJob(
      { ...baseJob, title: "Director Platform Engineering" },
      { ...profile, titleTerms: ["Director of Engineering"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 89,
      reasons: [
        { code: "title-match", term: "Director of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("distinguishes the exact partial-title threshold from the value below it", () => {
    const thresholdResult = evaluateJob(
      { ...baseJob, title: "Distributed Systems Platform Software" },
      {
        ...profile,
        titleTerms: ["Distributed Systems Platform Software Engineer"],
        minScore: 0,
      },
      new Date("2026-07-29T00:00:00Z"),
    );
    const belowThresholdResult = evaluateJob(
      { ...baseJob, title: "Distributed Systems Platform" },
      {
        ...profile,
        titleTerms: ["Distributed Systems Platform Software Engineer"],
        minScore: 0,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(thresholdResult).toEqual({
      status: "matched",
      score: 81,
      reasons: [
        { code: "title-match", term: "Distributed Systems Platform Software Engineer" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
    expect(belowThresholdResult).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "title-mismatch" }],
    });
  });

  it("requires overlap with a non-generic target word even at a permissive threshold", () => {
    const permissiveMatcher = createJobMatcher({
      ...matchingPolicy,
      partialTokenThreshold: 0.6,
    });

    const result = permissiveMatcher(
      { ...baseJob, title: "Senior Manager, Product" },
      { ...profile, titleTerms: ["Senior Manager, Engineering"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "title-mismatch" }],
    });
  });

  it("allows a partial match when a target title contains only generic words", () => {
    const result = evaluateJob(
      { ...baseJob, title: "Senior Manager Director Lead" },
      {
        ...profile,
        titleTerms: ["Senior Manager Director Lead Principal"],
        minScore: 0,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 81,
      reasons: [
        { code: "title-match", term: "Senior Manager Director Lead Principal" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("keeps the first equally scoring target term as the reported match", () => {
    const result = evaluateJob(
      baseJob,
      { ...profile, titleTerms: ["Head of Engineering", "head of engineering"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.reasons[0]).toEqual({ code: "title-match", term: "Head of Engineering" });
  });

  it("records a required context term when the posting contains it", () => {
    const result = evaluateJob(
      { ...baseJob, description: "Lead a software platform engineering organization." },
      { ...profile, requiredJobTerms: ["Software platform"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "job-context-match", term: "Software platform" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("ignores punctuation-only exclusion terms after normalization", () => {
    const result = evaluateJob(
      baseJob,
      { ...profile, excludedTitleTerms: ["---"] },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
  });

  it("accepts a listing exactly at the age limit and rejects one just beyond it", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    const atBoundary = evaluateJob(
      { ...baseJob, publishedAt: new Date("2026-07-01T00:00:00.000Z") },
      profile,
      now,
    );
    const beyondBoundary = evaluateJob(
      { ...baseJob, publishedAt: new Date("2026-06-30T23:59:59.999Z") },
      profile,
      now,
    );

    expect(atBoundary).toEqual({
      status: "matched",
      score: 92,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 30 },
      ],
      exclusionReasons: [],
    });
    expect(beyondBoundary).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "stale-listing", maximumAgeDays: 30 }],
    });
  });

  it("uses the unknown-date score and reason when no posting date is published", () => {
    const result = evaluateJob(
      { ...baseJob, publishedAt: null },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 95,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posting-date-unknown" },
      ],
      exclusionReasons: [],
    });
  });

  it("matches at the minimum score boundary and excludes just above it", () => {
    const now = new Date("2026-07-29T00:00:00Z");

    expect(evaluateJob(baseJob, { ...profile, minScore: 99 }, now)).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
    expect(evaluateJob(baseJob, { ...profile, minScore: 100 }, now)).toEqual({
      status: "excluded",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [{ code: "score-below", minimumScore: 100 }],
    });
  });

  it("caps a score above one hundred", () => {
    const highLocationScoreMatcher = createJobMatcher({
      ...matchingPolicy,
      locationScore: 50,
    });

    const result = highLocationScoreMatcher(baseJob, profile, new Date("2026-07-29T00:00:00Z"));

    expect(result.score).toBe(100);
  });

  it("recognizes remote work when any configured remote term is present", () => {
    const multiTermRemoteMatcher = createJobMatcher({
      ...matchingPolicy,
      remoteTerms: ["remote", "distributed"],
    });

    const result = multiTermRemoteMatcher(
      { ...baseJob, locationText: "", locations: [], workplaceType: "Remote" },
      { ...profile, locationTerms: ["London"], includeRemote: true },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
    expect(result.reasons).toContainEqual({ code: "remote-allowed" });
  });

  it("accepts numeric remote-location qualifiers but not alphabetic restrictions", () => {
    const remoteProfile = { ...profile, locationTerms: ["London"], includeRemote: true };
    const now = new Date("2026-07-29T00:00:00Z");

    expect(
      evaluateJob(
        { ...baseJob, locationText: "Remote 42", locations: [], workplaceType: "Remote" },
        remoteProfile,
        now,
      ).status,
    ).toBe("matched");
    expect(
      evaluateJob(
        { ...baseJob, locationText: "Remote global", locations: [], workplaceType: "Remote" },
        remoteProfile,
        now,
      ),
    ).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [{ code: "location-mismatch" }],
    });
    expect(
      evaluateJob(
        { ...baseJob, locationText: "Remote zone42", locations: [], workplaceType: "Remote" },
        remoteProfile,
        now,
      ).status,
    ).toBe("excluded");
    expect(
      evaluateJob(
        { ...baseJob, locationText: "Remote 42percent", locations: [], workplaceType: "Remote" },
        remoteProfile,
        now,
      ).status,
    ).toBe("excluded");
  });

  it("rejects a published salary range below the profile preference", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("GBP", 70_000, 90_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContainEqual({
      code: "salary-below",
      salary: { currency: "GBP", min: 70_000, max: 90_000 },
    });
  });

  it("rejects a published salary range above the profile preference", () => {
    const salary = createAnnualSalaryRange("GBP", 150_001, 180_000);
    const result = evaluateJob(
      { ...baseJob, publishedSalary: salary },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons: [
        {
          code: "salary-above",
          salary: { currency: "GBP", min: 150_001, max: 180_000 },
        },
      ],
    });
  });

  it("keeps a role whose published salary overlaps the preference", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("GBP", 90_000, 120_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        {
          code: "salary-overlap",
          salary: { currency: "GBP", min: 90_000, max: 120_000 },
        },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("records a salary overlap at a one-sided preference boundary", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("GBP", 90_000, 100_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: null,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.reasons).toContainEqual({
      code: "salary-overlap",
      salary: { currency: "GBP", min: 90_000, max: 100_000 },
    });
  });

  it("records a salary overlap for a maximum-only preference", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("GBP", 150_000, 180_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: null,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.reasons).toContainEqual({
      code: "salary-overlap",
      salary: { currency: "GBP", min: 150_000, max: 180_000 },
    });
  });

  it("keeps a role when salary is not published", () => {
    const result = evaluateJob(
      baseJob,
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("keeps a role when its published salary uses another currency", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("USD", 70_000, 90_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });

  it("does not report salary overlap when the profile has no salary boundary", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        publishedSalary: createAnnualSalaryRange("GBP", 100_000, 150_000),
      },
      {
        ...profile,
        salaryCurrency: currencyFrom("GBP"),
        salaryMin: null,
        salaryMax: null,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result).toEqual({
      status: "matched",
      score: 99,
      reasons: [
        { code: "title-match", term: "Head of Engineering" },
        { code: "location-match", term: "Dubai" },
        { code: "posted-age", days: 4 },
      ],
      exclusionReasons: [],
    });
  });
});
