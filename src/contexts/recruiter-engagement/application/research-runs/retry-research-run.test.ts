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
import { createResearchRunRetrier } from "./retry-research-run";

describe("research run retry", () => {
  it("reuses the frozen policy and source plan without widening the prior run", async () => {
    const previous = {
      ...createResearchRun({
        id: "run-1",
        brief: createSearchBrief({ description: "UAE fintech", recruiterTarget: 24 }),
        policy: testAdapterPolicy,
        sourcePlan: testSourcePlan,
        startedAt: new Date("2026-08-27T10:00:00.000Z"),
      }),
      status: "partial" as const,
      checkpoint: "recruiters" as const,
      completionReason: "The recruiter stage was unavailable.",
      finishedAt: new Date("2026-08-27T10:01:00.000Z"),
    };
    const runs = createFakeResearchRunStore([previous]);
    const scheduler = createFakeResearchRunScheduler();
    const retrier = createResearchRunRetrier({
      createId: () => "run-2",
      now: () => new Date("2026-08-27T10:02:00.000Z"),
      runs,
      scheduler,
    });

    const result = await retrier.retryResearchRun("run-1");

    expect(result).toEqual({ status: "started", runId: "run-2" });
    expect(await runs.get("run-2")).toMatchObject({
      budget: previous.budget,
      brief: previous.brief,
      policy: previous.policy,
      retryOfRunId: "run-1",
      sourcePlan: previous.sourcePlan,
    });
    expect(scheduler.scheduledRunIds).toEqual(["run-2"]);
  });
});
