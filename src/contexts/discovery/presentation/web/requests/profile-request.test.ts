import { describe, expect, it } from "vitest";

import { parseProfileRequest } from "./profile-request";

describe("profile request", () => {
  it("normalizes form fields into an application command", () => {
    const result = parseProfileRequest(
      profileForm({
        name: "  UAE engineering leadership  ",
        titleTerms: "VP Engineering\nHead of Engineering\nVP Engineering",
        locationTerms: "Dubai, Abu Dhabi",
        includeRemote: "on",
        includeUnverified: "on",
        salaryCurrency: "gbp",
        salaryMin: "100000",
        salaryMax: "150000",
      }),
    );

    expect(result).toEqual({
      ok: true,
      command: {
        id: undefined,
        profile: {
          name: "UAE engineering leadership",
          targetTitles: ["VP Engineering", "Head of Engineering"],
          targetLocations: ["Dubai", "Abu Dhabi"],
          requiredJobTerms: [],
          excludedTitleTerms: [],
          excludedLocationTerms: [],
          excludedDescriptionTerms: [],
          includeRemote: true,
          includeUnverified: true,
          salaryPreference: {
            currency: "GBP",
            minimumAnnual: 100_000,
            maximumAnnual: 150_000,
          },
          maximumAgeDays: 30,
          minimumScore: 70,
        },
      },
    });
  });

  it("keeps an unspecified salary as an allowed empty preference", () => {
    const result = parseProfileRequest(profileForm());

    expect(result.ok && result.command.profile.salaryPreference).toEqual({
      currency: null,
      minimumAnnual: null,
      maximumAnnual: null,
    });
  });

  it("requires a currency when a salary boundary is present", () => {
    expect(parseProfileRequest(profileForm({ salaryMin: "100000" }))).toEqual({
      ok: false,
      message: "Add a salary currency when setting a salary range.",
    });
  });

  it("rejects an inverted salary range", () => {
    expect(
      parseProfileRequest(
        profileForm({ salaryCurrency: "GBP", salaryMin: "150000", salaryMax: "100000" }),
      ),
    ).toEqual({
      ok: false,
      message: "Salary maximum must be at least the salary minimum.",
    });
  });
});

function profileForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    name: "UAE engineering leadership",
    titleTerms: "VP Engineering",
    locationTerms: "Dubai",
    requiredJobTerms: "",
    excludedTitleTerms: "",
    excludedLocationTerms: "",
    excludedDescriptionTerms: "",
    includeRemote: "",
    includeUnverified: "",
    salaryCurrency: "",
    salaryMin: "",
    salaryMax: "",
    maxAgeDays: "30",
    minScore: "70",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      formData.set(key, value);
    }
  }
  return formData;
}
