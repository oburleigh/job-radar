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
import { createResearchRunCanceller } from "./cancel-research-run";

describe("research run cancellation", () => {
  it("persists cancellation before asking the scheduler to signal running work", async () => {
    const runs = createFakeResearchRunStore([
      createResearchRun({
        id: "run-1",
        brief: createSearchBrief({ description: "UAE technology" }),
        policy: testAdapterPolicy,
        sourcePlan: testSourcePlan,
        startedAt: new Date("2026-08-27T10:00:00.000Z"),
      }),
    ]);
    const scheduler = createFakeResearchRunScheduler();
    const canceller = createResearchRunCanceller({
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      scheduler,
    });

    await canceller.cancelResearchRun("run-1");

    expect((await runs.get("run-1"))?.status).toBe("cancelled");
    expect(scheduler.cancelledRunIds).toEqual(["run-1"]);
  });
});
