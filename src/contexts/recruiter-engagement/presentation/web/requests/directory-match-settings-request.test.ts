import { describe, expect, it } from "vitest";
import { parseDirectoryMatchSettingsRequest } from "./directory-match-settings-request";

describe("directory match settings request", () => {
  it("accepts integer weights that total 100", () => {
    expect(
      parseDirectoryMatchSettingsRequest(
        form({ specialism: "25", currentMandatesOrActivity: "10" }),
      ),
    ).toMatchObject({ ok: true, command: { specialism: 25 } });
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
    currentMandatesOrActivity: "15",
    evidenceFreshnessAndQuality: "10",
    namedRecruiterOrTeamEvidence: "10",
    recruiterRoleAndSeniority: "15",
    scaleOrTrackRecord: "10",
    specialism: "20",
    targetMarketOperatingDepth: "20",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}
