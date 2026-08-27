import { describe, expect, it } from "vitest";

import {
  cancelResearchRun,
  consumeStageRequest,
  createResearchCoverage,
  createResearchRun,
  createSearchBrief,
  DEFAULT_RECRUITER_TARGET,
  firmTargetFor,
  isRunAcceptingObservations,
} from "./research-run";

const testAdapterPolicy = {
  allowedPublicSourceScope: ["Public HTTPS firm pages", "Public LinkedIn profile results"],
  authorization: { reference: "test", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  execution: {
    automaticRetry: false,
    ephemeral: true,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    sandboxMode: "read-only",
    webSearchEnabled: true,
  },
  id: "local-codex-cli-web-search-v1",
  permittedOperations: ["Public web search", "Public LinkedIn profile-result research"],
  permittedPublicData: ["Public evidence"],
  rateLimit: { stageRequestLimit: 1, subscriptionExhaustionBehavior: "No retry." },
  retention: { deletionRule: "Delete local data.", rule: "Public evidence only." },
  version: "1",
} as const;

const testSourcePlan = {
  entries: [
    {
      adapterId: "local-codex-cli-web-search-v1",
      allowedPublicSources: ["Public HTTPS firm pages"],
      id: "firms",
      policyVersion: "1",
      stage: "firms",
    },
    {
      adapterId: "local-codex-cli-web-search-v1",
      allowedPublicSources: ["Public LinkedIn profile results"],
      id: "recruiters",
      policyVersion: "1",
      stage: "recruiters",
    },
  ],
  id: "public-web-linkedin-v1",
  stageRequestAllowance: { firms: 1, recruiters: 1 },
  version: "1",
} as const;

describe("search brief", () => {
  it("defaults the recruiter target and rejects a non-positive target", () => {
    expect(createSearchBrief({ description: "UAE fintech engineering" })).toMatchObject({
      description: "UAE fintech engineering",
      recruiterTarget: DEFAULT_RECRUITER_TARGET,
      criteria: { targetLocations: ["United Arab Emirates"] },
    });
    expect(() => createSearchBrief({ description: "UAE", recruiterTarget: 0 })).toThrow(
      "Recruiter target must be a positive safe integer.",
    );
  });

  it("makes cancellation terminal before a later source observation can be stored", () => {
    const run = createResearchRun({
      id: "run-1",
      brief: createSearchBrief({ description: "UAE technology" }),
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
      brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 24 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    expect(firmTargetFor(24)).toBe(10);
    expect(
      createResearchCoverage({
        run,
        observations: [{ kind: "firm" }, { kind: "recruiter" }, { kind: "recruiter" }],
      }),
    ).toMatchObject({
      firmTarget: 10,
      observedFirmCount: 1,
      observedRecruiterCount: 2,
      recruiterTarget: 24,
    });
  });

  it("records a terminal exhausted outcome when a stage request allowance is consumed", () => {
    const run = createResearchRun({
      id: "run-exhausted",
      brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 20 }),
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
