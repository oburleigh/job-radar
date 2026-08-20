import { describe, expect, it } from "vitest";

import { suggestSearchIntegration } from "./custom-integration";

describe("custom search integration suggestions", () => {
  it("derives an ATS identity and exact search host from a pasted URL", () => {
    expect(
      suggestSearchIntegration("https://jobs.teamtailor.com/jobs/123-platform-director", []),
    ).toEqual({
      atsType: "teamtailor",
      label: "Teamtailor",
      hostname: "jobs.teamtailor.com",
      pattern: "jobs.teamtailor.com",
    });
  });

  it("handles common country-code public suffixes and ID conflicts", () => {
    expect(
      suggestSearchIntegration("https://careers.example.co.uk/openings", ["example"]),
    ).toMatchObject({
      atsType: "example-2",
      label: "Example",
      hostname: "careers.example.co.uk",
    });
  });
});
