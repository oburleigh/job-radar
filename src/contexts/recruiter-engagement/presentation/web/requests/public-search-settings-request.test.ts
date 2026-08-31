import { describe, expect, it } from "vitest";

import { parsePublicSearchSettingsRequest } from "./public-search-settings-request";

describe("public search settings request", () => {
  it("maps provider, budgets, and editable query terms into the application command", () => {
    const formData = validFormData();
    formData.set("maxPagesPerQuery", "2");
    formData.set("stageRequestLimit", "40");
    formData.set("firmDiscoveryPhrases", "technology recruitment agency\nIT recruitment agency");
    formData.set("recruiterRoleTerms", "recruiter, talent acquisition");
    formData.set("currentActivityTerms", "hiring\njobs");
    formData.set("namedRecruiterOrTeamTerms", "team\nconsultants");
    formData.set("scaleOrTrackRecordTerms", "global\nyears");
    formData.set("excludedHosts", "directory.example\nlist.example");

    expect(parsePublicSearchSettingsRequest(formData)).toEqual({
      ok: true,
      command: {
        currentActivityTerms: ["hiring", "jobs"],
        excludedHosts: ["directory.example", "list.example"],
        firmDiscoveryPhrases: ["technology recruitment agency", "IT recruitment agency"],
        maxPagesPerQuery: 2,
        namedRecruiterOrTeamTerms: ["team", "consultants"],
        profileSourceHosts: ["linkedin.com/in"],
        providerName: "serper",
        recruiterRoleTerms: ["recruiter", "talent acquisition"],
        resultsPerQuery: 10,
        scaleOrTrackRecordTerms: ["global", "years"],
        stageRequestLimit: 40,
      },
    });
  });

  it("rejects an empty firm discovery policy", () => {
    const formData = validFormData();
    formData.set("firmDiscoveryPhrases", "");

    expect(parsePublicSearchSettingsRequest(formData)).toMatchObject({
      field: "firmDiscoveryPhrases",
      ok: false,
    });
  });
});

function validFormData(): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries({
    currentActivityTerms: "hiring",
    excludedHosts: "",
    firmDiscoveryPhrases: "recruitment firm",
    maxPagesPerQuery: "1",
    namedRecruiterOrTeamTerms: "team",
    profileSourceHosts: "linkedin.com/in",
    providerName: "serper",
    recruiterRoleTerms: "recruiter",
    resultsPerQuery: "10",
    scaleOrTrackRecordTerms: "global",
    stageRequestLimit: "20",
  })) {
    formData.set(name, value);
  }
  return formData;
}
