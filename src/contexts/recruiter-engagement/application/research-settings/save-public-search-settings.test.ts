import { describe, expect, it, vi } from "vitest";

import { createSavePublicSearchSettings } from "./save-public-search-settings";

describe("save public search settings", () => {
  it("persists the complete query policy at the application clock time", () => {
    const replacePublicSearch = vi.fn();
    const changedAt = new Date("2026-08-31T10:30:00.000Z");
    const save = createSavePublicSearchSettings({
      now: () => changedAt,
      settings: { replacePublicSearch },
    });
    const settings = publicSearchSettings();

    expect(save(settings)).toEqual({ status: "saved" });
    expect(replacePublicSearch).toHaveBeenCalledWith(settings, changedAt);
  });
});

function publicSearchSettings() {
  return {
    currentActivityTerms: ["hiring"],
    excludedHosts: [],
    firmDiscoveryPhrases: ["technology recruitment firm"],
    maxPagesPerQuery: 2,
    namedRecruiterOrTeamTerms: ["team"],
    profileSourceHosts: ["linkedin.com/in"],
    providerName: "serper",
    recruiterRoleTerms: ["recruiter"],
    resultsPerQuery: 10,
    scaleOrTrackRecordTerms: ["global"],
    stageRequestLimit: 40,
  };
}
