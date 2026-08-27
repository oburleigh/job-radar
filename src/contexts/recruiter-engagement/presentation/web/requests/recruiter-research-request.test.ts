import { describe, expect, it } from "vitest";

import { parseRecruiterResearchStartRequest } from "./recruiter-research-request";

describe("recruiter research request", () => {
  it("accepts a plain-language brief and a positive caller-controlled target", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE fintech engineering",
          geography: "United Arab Emirates",
          industries: "Financial services, Healthcare",
          recruiterTarget: "24",
          specialisms: "Software engineering, Data and AI",
        }),
      ),
    ).toEqual({
      status: "valid",
      command: {
        brief: "UAE fintech engineering",
        criteria: {
          geography: "United Arab Emirates",
          industries: ["Financial services", "Healthcare"],
          specialisms: ["Software engineering", "Data and AI"],
        },
        recruiterTarget: 24,
      },
    });
  });

  it("returns a recoverable validation error before any research run can start", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE technology",
          geography: "United Arab Emirates",
          industries: "Technology",
          recruiterTarget: "0",
          specialisms: "Software engineering",
        }),
      ),
    ).toEqual({
      status: "invalid",
      field: "recruiterTarget",
      message: "Recruiters to find must be a positive integer.",
    });
  });

  it("reports the invalid structured criterion instead of blaming the recruiter target", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE technology",
          geography: "",
          industries: "Technology",
          recruiterTarget: "20",
          specialisms: "Software engineering",
        }),
      ),
    ).toEqual({
      status: "invalid",
      field: "geography",
      message: "Geography is required.",
    });
  });
});

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}
