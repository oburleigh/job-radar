import { describe, expect, it } from "vitest";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createFakeResearchRunStore } from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunActivityReader } from "./list-research-runs";

describe("Research Run activity reader", () => {
  it("returns every run in the store's activity order", async () => {
    const run = createResearchRun({
      id: "run-1",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-30T10:00:00.000Z"),
    });
    const reader = createResearchRunActivityReader({
      runs: createFakeResearchRunStore([run]),
    });

    await expect(reader.listResearchRuns()).resolves.toEqual([run]);
  });
});
