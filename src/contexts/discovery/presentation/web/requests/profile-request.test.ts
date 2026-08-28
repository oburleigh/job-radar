import { describe, expect, it } from "vitest";

import { parseProfileRequest } from "./profile-request";

describe("profile request", () => {
  it("normalizes form fields into an application command", () => {
    const result = parseProfile(
      profileForm({
        name: "  UAE engineering leadership  ",
        titleTerms: "VP Engineering\nHead of Engineering\nVP Engineering",
        locationTerms: "united arab emirates\nchina",
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
          targetLocations: ["United Arab Emirates", "China"],
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
    const result = parseProfile(profileForm());

    expect(result.ok && result.command.profile.salaryPreference).toEqual({
      currency: null,
      minimumAnnual: null,
      maximumAnnual: null,
    });
  });

  it("requires a currency when a salary boundary is present", () => {
    expect(parseProfile(profileForm({ salaryMin: "100000" }))).toEqual({
      ok: false,
      message: "Add a salary currency when setting a salary range.",
    });
  });

  it("uses the stable target-location message when no location is supplied", () => {
    expect(parseProfile(profileForm({ locationTerms: " " }))).toEqual({
      ok: false,
      message: "Add at least one target location.",
    });
  });

  it("rejects a target location that is not selected from the catalogue", () => {
    expect(parseProfile(profileForm({ locationTerms: "oli" }))).toEqual({
      ok: false,
      message: "Choose each target location from the suggestions.",
    });
  });

  it("canonicalizes a legacy repeated city segment to the catalogue label", () => {
    const result = parseProfile(
      profileForm({ locationTerms: "Dubai, Dubai, United Arab Emirates" }),
    );

    expect(result.ok && result.command.profile.targetLocations).toEqual([
      "Dubai, United Arab Emirates",
    ]);
  });

  it("rejects a three-letter value that is not an ISO 4217 currency", () => {
    expect(parseProfile(profileForm({ salaryCurrency: "ZZZ" }))).toEqual({
      ok: false,
      message: "Salary currency must be a valid ISO 4217 code such as GBP.",
    });
  });

  it("rejects an inverted salary range", () => {
    expect(
      parseProfile(
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
    locationTerms: "United Arab Emirates",
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

function parseProfile(formData: FormData) {
  return parseProfileRequest(formData, [
    { label: "China" },
    { label: "Dubai, United Arab Emirates" },
    { label: "United Arab Emirates" },
  ]);
}
