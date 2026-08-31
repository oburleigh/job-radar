import { describe, expect, it } from "vitest";

import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testEvidence,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";

import { createResearchSourceSet } from "./research-source-set";

describe("Research Source set", () => {
  it("retains observations from available Sources and records another Source failure", async () => {
    const failures: unknown[] = [];
    const run = sampleRun();
    const source = createResearchSourceSet({
      failures: { record: async (failure) => void failures.push(failure) },
      now: () => new Date("2026-08-31T11:00:00.000Z"),
      sources: [
        identifiedSource("source-one", {
          findFirms: async () => {
            throw new Error("Source one timed out.");
          },
        }),
        identifiedSource("source-two", { findFirms: async () => [firmObservation()] }),
      ],
    });

    await expect(source.findFirms({ reserveRequest: async () => true, run })).resolves.toEqual([
      firmObservation(),
    ]);
    expect(failures).toEqual([
      {
        adapterId: "source-one",
        message: "Source one timed out.",
        recordedAt: new Date("2026-08-31T11:00:00.000Z"),
        runId: run.id,
        stage: "firms",
      },
    ]);
  });

  it("fails the stage only when every permitted Source fails", async () => {
    const source = createResearchSourceSet({
      failures: { record: async () => undefined },
      now: () => new Date(),
      sources: [
        identifiedSource("source-one", {
          findFirms: async () => {
            throw new Error("First failed.");
          },
        }),
        identifiedSource("source-two", {
          findFirms: async () => {
            throw new Error("Second failed.");
          },
        }),
      ],
    });

    await expect(
      source.findFirms({ reserveRequest: async () => true, run: sampleRun() }),
    ).rejects.toThrow("Every permitted Source failed during the firms stage.");
  });

  it("is available when at least one configured Source accepts the frozen run", () => {
    const source = createResearchSourceSet({
      failures: { record: async () => undefined },
      now: () => new Date(),
      sources: [
        identifiedSource("disabled-source", {
          assess: () => ({ available: false, message: "Disabled." }),
        }),
        identifiedSource("available-source"),
      ],
    });

    expect(source.assess(sampleRun())).toEqual({ available: true });
  });
});

function identifiedSource(
  adapterId: string,
  overrides: Partial<{
    readonly assess: () =>
      | { readonly available: true }
      | { readonly available: false; readonly message: string };
    readonly findFirms: () => Promise<readonly ReturnType<typeof firmObservation>[]>;
  }> = {},
) {
  return {
    adapterId,
    assess: overrides.assess ?? (() => ({ available: true as const })),
    findFirms: overrides.findFirms ?? (async () => []),
    findRecruiters: async () => [],
  };
}

function sampleRun() {
  return createResearchRun({
    brief: testSearchBrief({ firmTarget: 1, recruiterTarget: 1 }),
    id: "run-source-set",
    policy: testAdapterPolicy,
    sourcePlan: testSourcePlan,
    startedAt: new Date("2026-08-31T10:00:00.000Z"),
  });
}

function firmObservation() {
  return {
    companyName: "Apex Search",
    evidence: testEvidence("https://apex-search.example/evidence"),
    industries: ["Technology"],
    kind: "firm" as const,
    reason: "Engineering recruitment.",
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: false,
      scaleOrTrackRecord: false,
      targetMarkets: ["United Arab Emirates"],
    },
    specialisms: ["Software engineering"],
    websiteUrl: "https://apex-search.example",
  };
}
