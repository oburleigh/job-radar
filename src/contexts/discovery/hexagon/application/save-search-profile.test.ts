import { describe, expect, it } from "vitest";

import {
  createInMemorySearchProfileRepository,
  type StoredSearchProfile,
} from "../../testing/in-memory-search-profile-repository";
import type { SearchProfileDefinition } from "../domain/search-profile";
import { createSaveSearchProfile } from "./save-search-profile";

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
      id: 8,
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

    const result = saveSearchProfile({ id: 7, profile: updatedProfile });

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

function profileDefinition(
  overrides: Partial<SearchProfileDefinition> = {},
): SearchProfileDefinition {
  return {
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
      currency: "GBP",
      minimumAnnual: 100_000,
      maximumAnnual: 150_000,
    },
    maximumAgeDays: 30,
    minimumScore: 70,
    ...overrides,
  };
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
  return { id, profile, createdAt: timestamp, updatedAt: timestamp };
}
