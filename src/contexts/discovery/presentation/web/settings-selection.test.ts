import { describe, expect, it } from "vitest";
import { resolveSettingsSelection, settingsUrl } from "./settings-selection";

const profiles = [{ id: 7 }, { id: 11 }];
const providers = [{ name: "serper" }, { name: "brave" }];

describe("settings selection", () => {
  it("accepts only a complete pair backed by known profiles and providers", () => {
    const params = new URLSearchParams("profile=7&provider=serper&redirect=https://example.com");

    expect(resolveSettingsSelection(params, profiles, providers)).toEqual({
      profile: "7",
      provider: "serper",
    });
  });

  it.each([
    "profile=999&provider=serper",
    "profile=7&provider=missing",
    "profile=7",
    "provider=serper",
  ])("rejects an incomplete or unknown pair: %s", (query) => {
    expect(resolveSettingsSelection(new URLSearchParams(query), profiles, providers)).toBeNull();
  });

  it("builds settings transitions from the validated pair and requested editor state", () => {
    const selection = { profile: "7", provider: "serper" };

    expect(settingsUrl(selection, { ats: "greenhouse" })).toBe(
      "/settings?profile=7&provider=serper&ats=greenhouse",
    );
    expect(settingsUrl(selection, { create: true })).toBe(
      "/settings?profile=7&provider=serper&new=1",
    );
  });
});
