import { describe, expect, it, vi } from "vitest";
import { createRecruiterDirectoryMaintenance } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import { createFakeRecruiterDirectoryStore } from "@/contexts/recruiter-engagement/test-support/recruiter-directory-fake";
import {
  testAdapterPolicy,
  testEvidence,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import {
  createFakeResearchRunScheduler,
  createFakeResearchRunStore,
} from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunContinuer } from "./continue-research-run";
import { createResearchRunExecution } from "./execute-research-run";
import type { ResearchRunStore, ResearchSource } from "./port";

const startedAt = new Date("2026-08-27T10:00:00.000Z");
const cancelledAt = new Date("2026-08-27T10:01:00.000Z");
const continuedAt = new Date("2026-08-27T10:02:00.000Z");

function testFirm(name: string): FirmObservation {
  const host = name.toLowerCase().replaceAll(" ", "-");
  return {
    kind: "firm",
    companyName: name,
    websiteUrl: `https://${host}.example`,
    evidence: testEvidence(`https://${host}.example/evidence`),
    reason: "Technology recruitment",
    industries: ["Technology"],
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: true,
      targetMarkets: ["United Arab Emirates"],
    },
    specialisms: ["Software engineering"],
  };
}

function pendingRun(id: string) {
  return createResearchRun({
    id,
    brief: testSearchBrief({ description: "UAE fintech", firmTarget: 2, recruiterTarget: 8 }),
    policy: testAdapterPolicy,
    sourcePlan: testSourcePlan,
    startedAt,
  });
}

/** Reproduces run 785fcb82: the firms stage succeeded, then the user cancelled at `recruiters`. */
async function cancelAtRecruiters(
  runs: ResearchRunStore,
  runId: string,
  firms: readonly FirmObservation[],
): Promise<void> {
  await runs.begin(runId, startedAt);
  await runs.reserveStageRequest(runId, "firms", startedAt);
  await runs.acceptStage(runId, "firms", firms, startedAt);
  await runs.cancel(runId, cancelledAt);
}

function recordingSource(): ResearchSource & {
  readonly findFirms: ReturnType<typeof vi.fn>;
  readonly findRecruiters: ReturnType<typeof vi.fn>;
} {
  const findFirms = vi.fn(async ({ reserveRequest }: { reserveRequest: () => Promise<boolean> }) =>
    (await reserveRequest()) ? [testFirm("Late Firm")] : [],
  );
  const findRecruiters = vi.fn(
    async ({ reserveRequest }: { reserveRequest: () => Promise<boolean> }) =>
      (await reserveRequest())
        ? [
            {
              kind: "recruiter" as const,
              name: "Amina Khan",
              title: "Technology Recruiter",
              companyName: "Firm One",
              profileUrl: "https://www.linkedin.com/in/amina-khan",
              evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
            },
          ]
        : [],
  );
  return {
    adapterId: "recording-research-source",
    assess: () => ({ available: true }),
    findFirms,
    findRecruiters,
  } as unknown as ResearchSource & {
    readonly findFirms: ReturnType<typeof vi.fn>;
    readonly findRecruiters: ReturnType<typeof vi.fn>;
  };
}

describe("research run continuation", () => {
  it("carries only the continued run's firm observations onto the new run", async () => {
    const runs = createFakeResearchRunStore([pendingRun("run-1"), pendingRun("run-9")]);
    await cancelAtRecruiters(runs, "run-1", [
      testFirm("Firm One"),
      testFirm("Firm Two"),
      testFirm("Firm Three"),
    ]);
    await cancelAtRecruiters(runs, "run-9", [testFirm("Other Firm")]);
    const previous = await runs.get("run-1");
    const scheduler = createFakeResearchRunScheduler();
    const continuer = createResearchRunContinuer({
      createId: () => "run-2",
      now: () => continuedAt,
      runs,
      scheduler,
    });

    const result = await continuer.continueResearchRun("run-1");

    expect(previous?.budgetUsage).toEqual({ firms: 1, recruiters: 0 });
    expect(result).toEqual({ status: "started", runId: "run-2" });
    expect(await runs.get("run-2")).toMatchObject({
      brief: previous?.brief,
      budgetUsage: { firms: 0, recruiters: 0 },
      checkpoint: "recruiters",
      continuedFromRunId: "run-1",
      policy: previous?.policy,
      retryOfRunId: null,
      sourcePlan: previous?.sourcePlan,
      status: "pending",
    });
    expect(
      (await runs.observationsFor("run-2"))
        .map((observation) =>
          observation.kind === "firm" ? observation.companyName : observation.name,
        )
        .toSorted(),
    ).toEqual(["Firm One", "Firm Three", "Firm Two"]);
    expect(scheduler.scheduledRunIds).toEqual(["run-2"]);
  });

  it("runs the recruiters stage over the carried firms without researching firms again", async () => {
    const runs = createFakeResearchRunStore([pendingRun("run-1")]);
    await cancelAtRecruiters(runs, "run-1", [
      testFirm("Firm One"),
      testFirm("Firm Two"),
      testFirm("Firm Three"),
    ]);
    const continuer = createResearchRunContinuer({
      createId: () => "run-2",
      now: () => continuedAt,
      runs,
      scheduler: createFakeResearchRunScheduler(),
    });
    const source = recordingSource();
    const execution = createResearchRunExecution({
      directory: createRecruiterDirectoryMaintenance({
        store: createFakeRecruiterDirectoryStore(),
      }),
      now: () => continuedAt,
      runs,
      source,
    });

    await continuer.continueResearchRun("run-1");
    await execution.executeResearchRun("run-2");

    expect(source.findFirms).not.toHaveBeenCalled();
    expect(source.findRecruiters).toHaveBeenCalledTimes(1);
    expect(
      source.findRecruiters.mock.calls[0]?.[0].firms
        .map((firm: FirmObservation) => firm.companyName)
        .toSorted(),
    ).toEqual(["Firm One", "Firm Three", "Firm Two"]);
    expect((await runs.get("run-2"))?.status).toBe("completed");
  });

  it("researches firms again when the continued run never passed the firms checkpoint", async () => {
    const runs = createFakeResearchRunStore([pendingRun("run-1")]);
    await runs.cancel("run-1", cancelledAt);
    const continuer = createResearchRunContinuer({
      createId: () => "run-2",
      now: () => continuedAt,
      runs,
      scheduler: createFakeResearchRunScheduler(),
    });
    const source = recordingSource();
    const execution = createResearchRunExecution({
      directory: createRecruiterDirectoryMaintenance({
        store: createFakeRecruiterDirectoryStore(),
      }),
      now: () => continuedAt,
      runs,
      source,
    });

    await continuer.continueResearchRun("run-1");

    expect((await runs.get("run-2"))?.checkpoint).toBe("firms");
    expect(await runs.observationsFor("run-2")).toEqual([]);

    await execution.executeResearchRun("run-2");

    expect(source.findFirms).toHaveBeenCalledTimes(1);
  });

  it("refuses to continue a run that has not finished", async () => {
    const runs = createFakeResearchRunStore([pendingRun("run-1")]);
    await runs.begin("run-1", startedAt);
    const continuer = createResearchRunContinuer({
      createId: () => "run-2",
      now: () => continuedAt,
      runs,
      scheduler: createFakeResearchRunScheduler(),
    });

    await expect(continuer.continueResearchRun("run-1")).rejects.toThrow(
      "Only a finished recruiter research run can be continued.",
    );
  });

  it("refuses to continue a run that reached the end of its stages", async () => {
    const runs = createFakeResearchRunStore([pendingRun("run-1")]);
    await runs.begin("run-1", startedAt);
    await runs.reserveStageRequest("run-1", "firms", startedAt);
    await runs.acceptStage("run-1", "firms", [testFirm("Firm One")], startedAt);
    await runs.reserveStageRequest("run-1", "recruiters", startedAt);
    await runs.acceptStage("run-1", "recruiters", [], startedAt);
    await runs.complete("run-1", cancelledAt);
    const continuer = createResearchRunContinuer({
      createId: () => "run-2",
      now: () => continuedAt,
      runs,
      scheduler: createFakeResearchRunScheduler(),
    });

    expect(await runs.get("run-1")).toMatchObject({
      checkpoint: "completed",
      status: "completed",
    });
    await expect(continuer.continueResearchRun("run-1")).rejects.toThrow(
      "This run completed both stages, so it has nothing left to continue.",
    );
  });
});
