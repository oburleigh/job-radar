import { describe, expect, it } from "vitest";

import { parseAtsIntegrationRequest } from "./ats-integration-request";

describe("ATS integration request", () => {
  it("maps a custom integration form into an application command", () => {
    const result = parseAtsIntegrationRequest(
      integrationForm({
        atsType: "teamtailor",
        label: "Teamtailor",
        searchPatterns: "jobs.example.com",
      }),
    );

    expect(result).toEqual({
      ok: true,
      command: {
        atsType: "teamtailor",
        isNew: true,
        label: "Teamtailor",
        searchPatterns: ["jobs.example.com"],
        hostnames: ["jobs.example.com"],
        hostSuffixes: [],
        supportsBoardSync: false,
        priority: 1_000,
        pageSize: null,
        endpoints: {},
      },
    });
  });

  it("rejects malformed endpoint configuration", () => {
    const result = parseAtsIntegrationRequest(integrationForm({ endpoints: "not json" }));

    expect(result).toEqual({
      ok: false,
      message: "Endpoints must be a JSON object containing valid URLs.",
    });
  });
});

function integrationForm(overrides: Record<string, string> = {}): FormData {
  const values = {
    atsType: "teamtailor",
    isNew: "1",
    label: "Teamtailor",
    searchPatterns: "jobs.example.com",
    hostnames: "",
    hostSuffixes: "",
    priority: "1000",
    pageSize: "",
    endpoints: "{}",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
