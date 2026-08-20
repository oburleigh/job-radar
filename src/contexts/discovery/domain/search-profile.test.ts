import { describe, expect, it } from "vitest";

import { currencyFrom } from "./currency";
import { createSearchProfileDefinition } from "./search-profile";

describe("search profile definition", () => {
  it("normalizes repeated business terms into an immutable definition", () => {
    const result = createSearchProfileDefinition({
      ...validDraft(),
      name: "  UAE leadership  ",
      targetTitles: ["VP Engineering", " VP Engineering ", "Head of Engineering"],
    });

    expect(result).toEqual({
      status: "valid",
      profile: expect.objectContaining({
        name: "UAE leadership",
        targetTitles: ["VP Engineering", "Head of Engineering"],
      }),
    });
    if (result.status === "valid") {
      expect(Object.isFrozen(result.profile)).toBe(true);
      expect(Object.isFrozen(result.profile.targetTitles)).toBe(true);
      expect(Object.isFrozen(result.profile.salaryPreference)).toBe(true);
    }
  });

  it.each([
    ["", "invalid-name"],
    ["x", "invalid-name"],
    ["x".repeat(121), "invalid-name"],
    ["ok", null],
    ["x".repeat(120), null],
  ] as const)("validates the profile name boundary", (name, expectedReason) => {
    const result = createSearchProfileDefinition({ ...validDraft(), name });

    expect(result.status === "invalid" ? result.reason : null).toBe(expectedReason);
  });

  it("requires at least one non-blank target title and location", () => {
    expect(createSearchProfileDefinition({ ...validDraft(), targetTitles: [" ", ""] })).toEqual({
      status: "invalid",
      reason: "missing-target-title",
    });
    expect(createSearchProfileDefinition({ ...validDraft(), targetLocations: [" ", ""] })).toEqual({
      status: "invalid",
      reason: "missing-target-location",
    });
  });

  it("rejects salary bounds without a currency", () => {
    expect(
      createSearchProfileDefinition({
        ...validDraft(),
        salaryPreference: { currency: null, minimumAnnual: 100_000, maximumAnnual: null },
      }),
    ).toEqual({ status: "invalid", reason: "salary-currency-required" });
  });

  it("rejects invalid score and age thresholds", () => {
    expect(createSearchProfileDefinition({ ...validDraft(), minimumScore: 101 })).toEqual({
      status: "invalid",
      reason: "invalid-minimum-score",
    });
    expect(createSearchProfileDefinition({ ...validDraft(), maximumAgeDays: 0 })).toEqual({
      status: "invalid",
      reason: "invalid-maximum-age",
    });
  });

  it.each([
    ["maximumAgeDays", 1, null],
    ["maximumAgeDays", 365, null],
    ["maximumAgeDays", 0, "invalid-maximum-age"],
    ["maximumAgeDays", 366, "invalid-maximum-age"],
    ["maximumAgeDays", 1.5, "invalid-maximum-age"],
    ["minimumScore", 0, null],
    ["minimumScore", 100, null],
    ["minimumScore", -1, "invalid-minimum-score"],
    ["minimumScore", 101, "invalid-minimum-score"],
    ["minimumScore", 50.5, "invalid-minimum-score"],
  ] as const)("validates %s=%s", (field, value, expectedReason) => {
    const result = createSearchProfileDefinition({ ...validDraft(), [field]: value });

    expect(result.status === "invalid" ? result.reason : null).toBe(expectedReason);
  });

  it.each([
    [999, null],
    [1_000.5, null],
    [null, 100_000_001],
    [200_000, 199_999],
  ] as const)("rejects invalid salary bounds %s to %s", (minimumAnnual, maximumAnnual) => {
    expect(
      createSearchProfileDefinition({
        ...validDraft(),
        salaryPreference: {
          currency: currencyFrom("GBP"),
          minimumAnnual,
          maximumAnnual,
        },
      }),
    ).toEqual({ status: "invalid", reason: "invalid-salary-range" });
  });

  it("accepts equal salary bounds and removes blank optional terms", () => {
    const result = createSearchProfileDefinition({
      ...validDraft(),
      requiredJobTerms: ["", " platform ", "platform", " "],
      salaryPreference: {
        currency: currencyFrom("GBP"),
        minimumAnnual: 100_000,
        maximumAnnual: 100_000,
      },
    });

    expect(result).toEqual({
      status: "valid",
      profile: expect.objectContaining({
        requiredJobTerms: ["platform"],
        salaryPreference: {
          currency: "GBP",
          minimumAnnual: 100_000,
          maximumAnnual: 100_000,
        },
      }),
    });
  });
});

function validDraft() {
  return {
    name: "UAE engineering leadership",
    targetTitles: ["VP Engineering"],
    targetLocations: ["Dubai"],
    requiredJobTerms: [],
    excludedTitleTerms: [],
    excludedLocationTerms: [],
    excludedDescriptionTerms: [],
    includeRemote: true,
    includeUnverified: false,
    salaryPreference: {
      currency: currencyFrom("AED"),
      minimumAnnual: 500_000,
      maximumAnnual: 750_000,
    },
    maximumAgeDays: 30,
    minimumScore: 70,
  } as const;
}
