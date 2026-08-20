import { describe, expect, it, vi } from "vitest";

import { createSaveSearchProfile } from "../../../hexagon/application/save-search-profile";
import { createInMemorySearchProfileRepository } from "../../../testing/in-memory-search-profile-repository";
import { createSaveProfileAction } from "./save-profile-action";

const timestamp = new Date("2026-08-20T09:00:00.000Z");

describe("save profile web action", () => {
  it("normalizes form input and creates a profile", async () => {
    const harness = actionHarness();

    const result = await harness.action(
      { ok: false, message: "" },
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

    expect(result).toEqual({ ok: true, message: "Profile saved." });
    expect(harness.profiles.records).toEqual([
      {
        id: 1,
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
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    expect(harness.revalidatePath.mock.calls).toEqual([["/"], ["/profiles"]]);
    expect(harness.redirect).toHaveBeenCalledWith("/profiles?profile=1");
  });

  it("keeps salary absent when the user has no salary preference", async () => {
    const harness = actionHarness();

    await harness.action({ ok: false, message: "" }, profileForm());

    expect(harness.profiles.records[0]?.profile.salaryPreference).toEqual({
      currency: "",
      minimumAnnual: null,
      maximumAnnual: null,
    });
  });

  it("returns duplicate-name feedback without web side effects", async () => {
    const harness = actionHarness();
    await harness.action({ ok: false, message: "" }, profileForm());
    harness.revalidatePath.mockClear();
    harness.redirect.mockClear();

    const result = await harness.action({ ok: false, message: "" }, profileForm());

    expect(result).toEqual({
      ok: false,
      message: "A profile with that name already exists.",
    });
    expect(harness.profiles.records).toHaveLength(1);
    expect(harness.revalidatePath).not.toHaveBeenCalled();
    expect(harness.redirect).not.toHaveBeenCalled();
  });

  it("updates the selected profile without redirecting to a new profile", async () => {
    const harness = actionHarness();
    await harness.action({ ok: false, message: "" }, profileForm());
    harness.revalidatePath.mockClear();
    harness.redirect.mockClear();

    const result = await harness.action(
      { ok: false, message: "" },
      profileForm({ id: "1", minScore: "82" }),
    );

    expect(result).toEqual({ ok: true, message: "Profile saved." });
    expect(harness.profiles.records).toHaveLength(1);
    expect(harness.profiles.records[0]?.profile.minimumScore).toBe(82);
    expect(harness.revalidatePath.mock.calls).toEqual([["/"], ["/profiles"]]);
    expect(harness.redirect).not.toHaveBeenCalled();
  });

  it("requires a currency when either salary boundary is present", async () => {
    const harness = actionHarness();

    const result = await harness.action(
      { ok: false, message: "" },
      profileForm({ salaryMin: "100000" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Add a salary currency when setting a salary range.",
    });
    expect(harness.profiles.records).toEqual([]);
    expect(harness.revalidatePath).not.toHaveBeenCalled();
    expect(harness.redirect).not.toHaveBeenCalled();
  });

  it("rejects an inverted salary range before invoking the use case", async () => {
    const harness = actionHarness();

    const result = await harness.action(
      { ok: false, message: "" },
      profileForm({ salaryCurrency: "GBP", salaryMin: "150000", salaryMax: "100000" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Salary maximum must be at least the salary minimum.",
    });
    expect(harness.profiles.records).toEqual([]);
    expect(harness.revalidatePath).not.toHaveBeenCalled();
    expect(harness.redirect).not.toHaveBeenCalled();
  });
});

function actionHarness() {
  const profiles = createInMemorySearchProfileRepository();
  const revalidatePath = vi.fn();
  const redirect = vi.fn();
  const action = createSaveProfileAction({
    assertLocalRequest: vi.fn(async () => undefined),
    saveSearchProfile: createSaveSearchProfile({ profiles, now: () => timestamp }),
    revalidatePath,
    redirect,
  });
  return { action, profiles, redirect, revalidatePath };
}

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
    salaryCurrency: "",
    salaryMin: "",
    salaryMax: "",
    maxAgeDays: "30",
    minScore: "70",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
