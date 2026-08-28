import { describe, expect, it } from "vitest";
import { parseDirectoryMatchSettingsRequest } from "./directory-match-settings-request";

describe("directory match settings request", () => {
  it("accepts integer weights that total 100", () => {
    expect(
      parseDirectoryMatchSettingsRequest(form({ specialism: "70", currentActivity: "5" })),
    ).toMatchObject({ ok: true, command: { specialism: 70 } });
  });

  it("rejects weights that do not total 100", () => {
    expect(parseDirectoryMatchSettingsRequest(form({ specialism: "59" }))).toEqual({
      ok: false,
      message: "Directory match weights must total 100.",
    });
  });
});

function form(overrides: Partial<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  const values = {
    currentActivity: "15",
    evidenceFreshnessAndQuality: "10",
    recruiterRoleAndSeniority: "15",
    specialism: "60",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}
