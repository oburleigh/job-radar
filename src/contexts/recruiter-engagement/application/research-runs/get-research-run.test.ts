import { describe, expect, it } from "vitest";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createFakeResearchRunStore } from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunGetter } from "./get-research-run";

describe("research run lookup", () => {
  it("returns the persisted run with its observations and source failures", async () => {
    const run = createResearchRun({
      id: "run-1",
      brief: createSearchBrief({ description: "UAE technology" }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const getter = createResearchRunGetter({ runs: createFakeResearchRunStore([run]) });

    await expect(getter.getResearchRun(run.id)).resolves.toMatchObject({ run });
    await expect(getter.getResearchRun("unknown")).resolves.toBeUndefined();
  });
});
