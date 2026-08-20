import { describe, expect, it } from "vitest";

import { createJobMatcher } from "./matching";
import type { MatchableJob, MatchingPolicy, MatchProfile } from "./types";

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

const profile: MatchProfile = {
  titleTerms: ["Head of Engineering", "Director of Engineering"],
  locationTerms: ["Dubai", "UAE"],
  requiredJobTerms: [],
  excludedTitleTerms: ["Assistant"],
  excludedLocationTerms: [],
  excludedDescriptionTerms: ["US only"],
  includeRemote: false,
  includeUnverified: false,
  salaryCurrency: "",
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
  rawPayload: {},
};

describe("deterministic matching", () => {
  it("matches a recent target title in the target location", () => {
    const result = evaluateJob(baseJob, profile, new Date("2026-07-29T00:00:00Z"));

    expect(result.status).toBe("matched");
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons).toContain("Title matches Head of Engineering");
  });

  it("rejects a role outside the configured location", () => {
    const result = evaluateJob(
      { ...baseJob, locationText: "London", locations: ["London"] },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContain("Location does not match the profile");
  });

  it("applies explicit exclusion terms before scoring", () => {
    const result = evaluateJob(
      { ...baseJob, title: "Assistant Head of Engineering" },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContain("Excluded title term: Assistant");
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
    expect(result.exclusionReasons).toContain(
      "Excluded description term: Security clearance required",
    );
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
    expect(result.exclusionReasons).toContain("Title does not match a target role");
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
    expect(result.exclusionReasons).toContain("Location does not match the profile");
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
    expect(result.exclusionReasons).toContain("Missing a required job keyword");
  });

  it("keeps unverified search-engine pages out unless the profile opts in", () => {
    const result = evaluateJob(
      { ...baseJob, verified: false },
      profile,
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContain("Web-search lead is not verified by an ATS feed");
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
    expect(result.exclusionReasons).toContain("Location does not match the profile");
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
    expect(result.exclusionReasons).toContain("Excluded location term: Canada");
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

    expect(result.status).toBe("matched");
    expect(result.reasons).toContain("Remote role allowed by profile");
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
    expect(result.reasons).toContain("Remote role allowed by profile");
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
    expect(result.reasons).toContain("Location matches United Kingdom");
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
    expect(result.exclusionReasons).toContain("Title does not match a target role");
  });

  it("rejects a published salary range below the profile preference", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        description: "The base salary range is £70,000 - £90,000 per year.",
      },
      {
        ...profile,
        salaryCurrency: "GBP",
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("excluded");
    expect(result.exclusionReasons).toContain(
      "Salary GBP 70,000-90,000 is below the preferred range",
    );
  });

  it("keeps a role whose published salary overlaps the preference", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        description: "The base salary range is £90,000 - £120,000 per year.",
      },
      {
        ...profile,
        salaryCurrency: "GBP",
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
    expect(result.reasons).toContain("Salary GBP 90,000-120,000 overlaps the profile preference");
  });

  it("keeps a role when salary is not published", () => {
    const result = evaluateJob(
      baseJob,
      {
        ...profile,
        salaryCurrency: "GBP",
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
  });

  it("keeps a role when its published salary uses another currency", () => {
    const result = evaluateJob(
      {
        ...baseJob,
        description: "The base salary range is $70,000 - $90,000 per year.",
      },
      {
        ...profile,
        salaryCurrency: "GBP",
        salaryMin: 100_000,
        salaryMax: 150_000,
      },
      new Date("2026-07-29T00:00:00Z"),
    );

    expect(result.status).toBe("matched");
  });
});
