import { describe, expect, it } from "vitest";

import { parseProfileRequest } from "./profile-request";

describe("profile request", () => {
  it("normalizes form fields into an application command", () => {
    const result = parseProfileRequest(
      profileForm({
        name: "  UAE engineering leadership  ",
        titleTerms: "VP Engineering\nHead of Engineering\nVP Engineering",
        locationTerms: "united arab emirates, china",
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

  it("uses the stable target-location message when no location is supplied", () => {
    expect(parseProfileRequest(profileForm({ locationTerms: " " }))).toEqual({
      ok: false,
      message: "Add at least one target location.",
    });
  });

  it("rejects a target location that is not selected from the catalogue", () => {
    expect(parseProfileRequest(profileForm({ locationTerms: "oli" }))).toEqual({
      ok: false,
      message: "Choose each target location from the suggestions.",
    });
  });

  it("requires unmatched saved locations to be replaced before saving", () => {
    expect(
      parseProfileRequest(
        profileForm({
          locationTerms: "China",
          legacyLocationTerms: "Dubai",
        }),
      ),
    ).toEqual({
      ok: false,
      message: "Replace saved target locations that are not in the location catalogue.",
    });
  });

  it("rejects a three-letter value that is not an ISO 4217 currency", () => {
    expect(parseProfileRequest(profileForm({ salaryCurrency: "ZZZ" }))).toEqual({
      ok: false,
      message: "Salary currency must be a valid ISO 4217 code such as GBP.",
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
    locationTerms: "United Arab Emirates",
    legacyLocationTerms: "",
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
