import { describe, expect, it } from "vitest";

import type { TargetLocationOption } from "@/contexts/recruiter-engagement/application/research-runs/target-locations";

import { parseRecruiterResearchStartRequest } from "./recruiter-research-request";

const targetLocationOptions = [
  { key: "country:AE", label: "United Arab Emirates" },
  { key: "subdivision:AE-AZ", label: "Abu Dhabi" },
  { key: "subdivision:AE-DU", label: "Dubai" },
] as const satisfies readonly TargetLocationOption[];

describe("recruiter research request", () => {
  it("accepts a plain-language brief and a positive caller-controlled target", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE fintech engineering",
          industries: "Financial services, Healthcare",
          recruiterTarget: "24",
          specialisms: "Software engineering, Data and AI",
          targetLocations: "United Arab Emirates",
        }),
        targetLocationOptions,
      ),
    ).toEqual({
      status: "valid",
      command: {
        brief: "UAE fintech engineering",
        criteria: {
          industries: ["Financial services", "Healthcare"],
          specialisms: ["Software engineering", "Data and AI"],
          targetLocations: ["United Arab Emirates"],
        },
        recruiterTarget: 24,
      },
    });
  });

  it("canonicalizes case-insensitive configured target location labels before they are persisted", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE fintech engineering",
          industries: "Financial services, Healthcare",
          recruiterTarget: "24",
          specialisms: "Software engineering, Data and AI",
          targetLocations: "united arab emirates",
        }),
        targetLocationOptions,
      ),
    ).toEqual({
      status: "valid",
      command: {
        brief: "UAE fintech engineering",
        criteria: {
          industries: ["Financial services", "Healthcare"],
          specialisms: ["Software engineering", "Data and AI"],
          targetLocations: ["United Arab Emirates"],
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
          industries: "Technology",
          recruiterTarget: "0",
          specialisms: "Software engineering",
          targetLocations: "United Arab Emirates",
        }),
        targetLocationOptions,
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
          industries: "Technology",
          recruiterTarget: "20",
          specialisms: "Software engineering",
          targetLocations: "",
        }),
        targetLocationOptions,
      ),
    ).toEqual({
      status: "invalid",
      field: "targetLocations",
      message: "Choose at least one target location from the catalogue.",
    });
  });

  it("rejects a forged target location that is not in the configured catalogue", () => {
    expect(
      parseRecruiterResearchStartRequest(
        formData({
          brief: "UAE technology",
          industries: "Technology",
          recruiterTarget: "20",
          specialisms: "Software engineering",
          targetLocations: "Forged location",
        }),
        targetLocationOptions,
      ),
    ).toEqual({
      status: "invalid",
      field: "targetLocations",
      message: "Choose target locations from the catalogue.",
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
