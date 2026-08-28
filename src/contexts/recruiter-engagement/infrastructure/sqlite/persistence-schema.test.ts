import { describe, expect, it } from "vitest";

import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";

import { parsePersistedResearchRun } from "./persistence-schema";

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
});
