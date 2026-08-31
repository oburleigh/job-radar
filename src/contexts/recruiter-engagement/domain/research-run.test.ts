import { describe, expect, it } from "vitest";

import {
  cancelResearchRun,
  consumeStageRequest,
  createResearchCoverage,
  createResearchRun,
  createSearchBrief,
  isRunAcceptingObservations,
} from "./research-run";

const testAdapterPolicy = {
  allowedPublicSourceScope: ["Public HTTPS firm pages", "Public LinkedIn profile results"],
  authorization: { reference: "test", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  id: "public-web-search:test:v1",
  permittedOperations: ["Public web search", "Public LinkedIn profile-result research"],
  permittedPublicData: ["Public evidence"],
  rateLimit: { stageRequestLimit: 1, subscriptionExhaustionBehavior: "No retry." },
  retention: { deletionRule: "Delete local data.", rule: "Public evidence only." },
  version: "1",
} as const;

const testSourcePlan = {
  entries: [
    {
      adapterId: "public-web-search:test:v1",
      allowedPublicSources: ["Public HTTPS firm pages"],
      id: "firms",
      policyVersion: "1",
      stage: "firms",
    },
    {
      adapterId: "public-web-search:test:v1",
      allowedPublicSources: ["Public LinkedIn profile results"],
      id: "recruiters",
      policyVersion: "1",
      stage: "recruiters",
    },
  ],
  id: "public-web-test-v1",
  publicSearch: null,
  stageRequestAllowance: { firms: 1, recruiters: 1 },
  version: "1",
} as const;

describe("search brief", () => {
  it("preserves caller-controlled criteria and independently validates both targets", () => {
    expect(
      createSearchBrief({
        criteria: {
          industries: ["Logistics"],
          specialisms: ["Platform engineering"],
          targetLocations: ["Singapore"],
        },
        description: " Singapore platform recruitment ",
        firmTarget: 12,
        recruiterTarget: 31,
      }),
    ).toEqual({
      criteria: {
        industries: ["Logistics"],
        specialisms: ["Platform engineering"],
        targetLocations: ["Singapore"],
      },
      description: "Singapore platform recruitment",
      firmTarget: 12,
      recruiterTarget: 31,
    });
    expect(() => brief({ recruiterTarget: 0 })).toThrow(
      "Recruiter target must be a positive safe integer.",
    );
    expect(() => brief({ firmTarget: 0 })).toThrow("Firm target must be a positive safe integer.");
    expect(() => brief({ firmTarget: 21, recruiterTarget: 20 })).toThrow(
      "Firm target cannot exceed recruiter target.",
    );
    expect(brief({ firmTarget: 20, recruiterTarget: 20 })).toMatchObject({
      firmTarget: 20,
      recruiterTarget: 20,
    });
  });

  it("makes cancellation terminal before a later source observation can be stored", () => {
    const run = createResearchRun({
      id: "run-1",
      brief: brief(),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    const cancelled = cancelResearchRun(run, new Date("2026-08-27T10:01:00.000Z"));

    expect(cancelled.status).toBe("cancelled");
    expect(isRunAcceptingObservations(cancelled)).toBe(false);
  });

  it("reports coverage against the coupled firm and recruiter targets", () => {
    const run = createResearchRun({
      id: "run-coverage",
      brief: brief({ firmTarget: 14, recruiterTarget: 24 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    expect(
      createResearchCoverage({
        run,
        observations: [{ kind: "firm" }, { kind: "recruiter" }, { kind: "recruiter" }],
      }),
    ).toMatchObject({
      firmTarget: 14,
      observedFirmCount: 1,
      observedRecruiterCount: 2,
      recruiterTarget: 24,
    });
  });

  it("records a terminal exhausted outcome when a stage request allowance is consumed", () => {
    const run = createResearchRun({
      id: "run-exhausted",
      brief: brief({ recruiterTarget: 20 }),
      policy: testAdapterPolicy,
      sourcePlan: {
        ...testSourcePlan,
        stageRequestAllowance: { firms: 0, recruiters: 1 },
      },
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    const exhausted = consumeStageRequest(run, "firms", new Date("2026-08-27T10:01:00.000Z"));

    expect(exhausted).toMatchObject({
      budgetExhaustion: { reason: "stage-request-allowance-reached", stage: "firms" },
      status: "failed",
    });
    expect(createResearchCoverage({ run: exhausted, observations: [] }).remainingRequests).toEqual({
      firms: 0,
      recruiters: 1,
    });
  });
});

function brief(
  overrides: { readonly firmTarget?: number; readonly recruiterTarget?: number } = {},
) {
  return createSearchBrief({
    criteria: {
      industries: ["Technology"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    description: "Technology recruitment",
    firmTarget: overrides.firmTarget ?? 10,
    recruiterTarget: overrides.recruiterTarget ?? 20,
  });
}
