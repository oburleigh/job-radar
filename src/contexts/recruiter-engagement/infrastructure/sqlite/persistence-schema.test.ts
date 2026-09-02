import { describe, expect, it } from "vitest";

import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";

import {
  parsePersistedObservation,
  parsePersistedRecruiterDirectory,
  parsePersistedResearchRun,
} from "./persistence-schema";

describe("persisted recruiter research run", () => {
  it("migrates legacy geography criteria to target locations while reading existing runs", () => {
    const run = createResearchRun({
      id: "legacy-run",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    const persisted = parsePersistedResearchRun({
      ...run,
      brief: {
        ...run.brief,
        criteria: {
          geography: "Dubai",
          industries: run.brief.criteria.industries,
          specialisms: run.brief.criteria.specialisms,
        },
      },
    });

    expect(persisted.brief.criteria).toEqual({
      targetLocations: ["Dubai"],
      industries: run.brief.criteria.industries,
      specialisms: run.brief.criteria.specialisms,
    });
  });

  it("reads back the execution settings a run froze into its source plan", () => {
    const execution = {
      model: "gpt-5.6-sol",
      reasoningEffort: "high" as const,
      stageTimeoutMs: 600_000,
    };
    const run = createResearchRun({
      id: "frozen-run",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: { ...testSourcePlan, execution },
      startedAt: new Date("2026-09-02T10:00:00.000Z"),
    });

    expect(parsePersistedResearchRun(run).sourcePlan.execution).toEqual(execution);
  });

  it("reads a run stored before execution settings were frozen as having none", () => {
    const run = createResearchRun({
      id: "pre-freeze-run",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-09-02T10:00:00.000Z"),
    });
    const { execution: _absent, ...sourcePlanWithoutExecution } = run.sourcePlan;

    expect(
      parsePersistedResearchRun({ ...run, sourcePlan: sourcePlanWithoutExecution }).sourcePlan
        .execution,
    ).toBeNull();
  });

  it.each([
    ["an unknown reasoning effort", { reasoningEffort: "extreme" }],
    ["an empty model", { model: "" }],
    ["a zero stage timeout", { stageTimeoutMs: 0 }],
    ["a negative stage timeout", { stageTimeoutMs: -1 }],
    ["a fractional stage timeout", { stageTimeoutMs: 1.5 }],
  ])("rejects a persisted frozen execution carrying %s", (_label, invalid) => {
    const run = createResearchRun({
      id: "malformed-run",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-09-02T10:00:00.000Z"),
    });
    const execution = {
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      stageTimeoutMs: 600_000,
      ...invalid,
    };

    expect(() =>
      parsePersistedResearchRun({ ...run, sourcePlan: { ...run.sourcePlan, execution } }),
    ).toThrow();
  });
});

describe("source-neutral recruiter profiles", () => {
  it("translates a legacy LinkedIn observation field at the SQLite boundary", () => {
    const observation = parsePersistedObservation({
      companyName: "Apex Search",
      evidence: {
        adapterId: "legacy-adapter",
        confidence: "high",
        excerpt: "Public recruiter profile.",
        observedAt: "2026-08-30",
        policyVersion: "1",
        sourceUrl: "https://www.linkedin.com/in/amina-khan",
      },
      kind: "recruiter",
      linkedInUrl: "https://www.linkedin.com/in/amina-khan",
      name: "Amina Khan",
      title: "Recruiter",
    });

    expect(observation).toMatchObject({
      kind: "recruiter",
      profileUrl: "https://www.linkedin.com/in/amina-khan",
    });
    expect(observation).not.toHaveProperty("linkedInUrl");
  });

  it("translates legacy Directory profiles without leaking the old field", () => {
    const directory = parsePersistedRecruiterDirectory({
      corrections: [],
      evidence: [],
      firms: [],
      identityReviews: [],
      recruiters: [
        {
          companyName: "Apex Search",
          firmId: null,
          firstObservedAt: "2026-08-30T10:00:00.000Z",
          id: "recruiter:linkedin.com/in/amina-khan",
          lastObservedAt: "2026-08-30T10:00:00.000Z",
          linkedInUrl: "https://www.linkedin.com/in/amina-khan",
          mergedInto: null,
          name: "Amina Khan",
          title: "Recruiter",
          workEmail: null,
        },
      ],
    });

    expect(directory.recruiters[0]).toMatchObject({
      profileUrl: "https://www.linkedin.com/in/amina-khan",
    });
    expect(directory.recruiters[0]).not.toHaveProperty("linkedInUrl");
  });
});
