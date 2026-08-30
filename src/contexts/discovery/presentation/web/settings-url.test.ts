import { describe, expect, it } from "vitest";
import { settingsUrl } from "./settings-url";

describe("settings URLs", () => {
  it("keeps ATS editor state on the ATS Registry settings page", () => {
    expect(settingsUrl({ ats: "greenhouse" })).toBe(
      "/settings/adapters/ats-registry?ats=greenhouse",
    );
    expect(settingsUrl({ create: true })).toBe("/settings/adapters/ats-registry?new=1");
  });
});
