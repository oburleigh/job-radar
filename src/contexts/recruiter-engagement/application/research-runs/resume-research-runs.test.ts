import { describe, expect, it } from "vitest";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import {
  createFakeResearchRunScheduler,
  createFakeResearchRunStore,
} from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunResumer } from "./resume-research-runs";

describe("research run resume", () => {
  it("schedules each interrupted run once from its durable checkpoint", async () => {
    const interrupted = {
      ...createResearchRun({
        id: "run-1",
        brief: createSearchBrief({ description: "UAE technology" }),
        policy: testAdapterPolicy,
        sourcePlan: testSourcePlan,
        startedAt: new Date("2026-08-27T10:00:00.000Z"),
      }),
      status: "interrupted" as const,
    };
    const scheduler = createFakeResearchRunScheduler();
    const resumer = createResearchRunResumer({
      runs: createFakeResearchRunStore([interrupted]),
      scheduler,
    });

    await resumer.resumeResearchRuns();

    expect(scheduler.scheduledRunIds).toEqual(["run-1"]);
  });
});
