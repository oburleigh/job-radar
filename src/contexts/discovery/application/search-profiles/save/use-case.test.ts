import { describe, expect, it } from "vitest";
import { currencyFrom } from "@/contexts/discovery/domain/currency";
import { type SearchProfileId, searchProfileIdFrom } from "@/contexts/discovery/domain/identifiers";
import {
  createSearchProfileDefinition,
  type SearchProfileDefinition,
  type SearchProfileDraft,
} from "@/contexts/discovery/domain/search-profile";
import {
  createInMemorySearchProfileRepository,
  type StoredSearchProfile,
} from "@/contexts/discovery/test-support/in-memory-search-profile-repository";
import { createSaveSearchProfile } from "./use-case";

const timestamp = new Date("2026-08-20T09:00:00.000Z");

describe("save search profile", () => {
  it("creates a profile through the repository port", () => {
    const profiles = createInMemorySearchProfileRepository();
    const saveSearchProfile = createSaveSearchProfile({ profiles, now: () => timestamp });

    const result = saveSearchProfile({ id: undefined, profile: profileDefinition() });

    expect(result).toEqual({ status: "saved", id: 1, created: true });
    expect(profiles.records).toEqual([
      {
        id: 1,
        profile: profileDefinition(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
  });

  it("rejects a name already owned by another profile", () => {
    const profiles = createInMemorySearchProfileRepository([
      storedProfile({ id: 7, profile: profileDefinition({ name: "Existing profile" }) }),
    ]);
    const saveSearchProfile = createSaveSearchProfile({ profiles, now: () => timestamp });

    const result = saveSearchProfile({
      id: profileId(8),
      profile: profileDefinition({ name: "Existing profile" }),
    });

    expect(result).toEqual({ status: "duplicate-name" });
    expect(profiles.records).toEqual([
      storedProfile({ id: 7, profile: profileDefinition({ name: "Existing profile" }) }),
    ]);
  });

  it("allows an existing profile to retain its own name", () => {
    const originalTimestamp = new Date("2026-08-19T09:00:00.000Z");
    const profiles = createInMemorySearchProfileRepository([
      storedProfile({ id: 7, profile: profileDefinition(), timestamp: originalTimestamp }),
    ]);
    const saveSearchProfile = createSaveSearchProfile({ profiles, now: () => timestamp });
    const updatedProfile = profileDefinition({ minimumScore: 82 });

    const result = saveSearchProfile({ id: profileId(7), profile: updatedProfile });

    expect(result).toEqual({ status: "saved", id: 7, created: false });
    expect(profiles.records).toEqual([
      {
        id: 7,
        profile: updatedProfile,
        createdAt: originalTimestamp,
        updatedAt: timestamp,
      },
    ]);
  });
});

function profileDefinition(overrides: Partial<SearchProfileDraft> = {}): SearchProfileDefinition {
  const result = createSearchProfileDefinition({
    name: "UAE engineering leadership",
    targetTitles: ["VP Engineering", "Head of Engineering"],
    targetLocations: ["Dubai", "Abu Dhabi"],
    requiredJobTerms: ["Software"],
    excludedTitleTerms: ["Assistant"],
    excludedLocationTerms: ["United States"],
    excludedDescriptionTerms: ["Security clearance"],
    includeRemote: true,
    includeUnverified: false,
    salaryPreference: {
      currency: currencyFrom("GBP"),
      minimumAnnual: 100_000,
      maximumAnnual: 150_000,
    },
    maximumAgeDays: 30,
    minimumScore: 70,
    ...overrides,
  });
  if (result.status === "invalid") {
    throw new Error(`Invalid profile fixture: ${result.reason}`);
  }
  return result.profile;
}

function storedProfile({
  id,
  profile,
  timestamp = new Date("2026-08-19T09:00:00.000Z"),
}: {
  readonly id: number;
  readonly profile: SearchProfileDefinition;
  readonly timestamp?: Date;
}): StoredSearchProfile {
  return { id: profileId(id), profile, createdAt: timestamp, updatedAt: timestamp };
}

function profileId(value: number): SearchProfileId {
  const id = searchProfileIdFrom(value);
  if (id === null) {
    throw new Error(`Invalid search profile fixture identifier: ${value}`);
  }
  return id;
}
