import { describe, expect, it } from "vitest";

import {
  testAdapterPolicy,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import {
  createFakeResearchRunScheduler,
  createFakeResearchRunStore,
} from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunStarter } from "./start-research-run";

describe("research run start", () => {
  it("freezes the requested recruiter target, policy, and source plan before scheduling work", async () => {
    const runs = createFakeResearchRunStore();
    const scheduler = createFakeResearchRunScheduler();
    const starter = createResearchRunStarter({
      createId: () => "run-1",
      now: () => new Date("2026-08-27T10:00:00.000Z"),
      runs,
      scheduler,
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
    });

    const result = await starter.startResearchRun({
      brief: "UAE fintech platform engineering",
      criteria: {
        industries: ["Financial services"],
        specialisms: ["Platform engineering"],
        targetLocations: ["United Arab Emirates"],
      },
      firmTarget: 12,
      recruiterTarget: 24,
    });

    expect(result).toEqual({ status: "started", runId: "run-1" });
    expect((await runs.get("run-1"))?.brief.recruiterTarget).toBe(24);
    expect((await runs.get("run-1"))?.brief.firmTarget).toBe(12);
    expect((await runs.get("run-1"))?.policy).toEqual(testAdapterPolicy);
    expect((await runs.get("run-1"))?.sourcePlan).toEqual(testSourcePlan);
    expect(scheduler.scheduledRunIds).toEqual(["run-1"]);
  });
});
