import { describe, expect, it, vi } from "vitest";
import { createRecruiterDirectoryMaintenance } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import { createFakeRecruiterDirectoryStore } from "@/contexts/recruiter-engagement/test-support/recruiter-directory-fake";
import {
  testAdapterPolicy,
  testEvidence,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import {
  createFakeResearchRunStore,
  createFakeResearchSource,
} from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { createResearchRunExecution } from "./execute-research-run";
import type { ResearchSource } from "./port";

describe("research run execution", () => {
  it("persists firm observations before continuing to named recruiters", async () => {
    const run = createResearchRun({
      id: "run-1",
      brief: testSearchBrief({ description: "UAE fintech engineering", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const runs = createFakeResearchRunStore([run]);
    const directory = createRecruiterDirectoryMaintenance({
      store: createFakeRecruiterDirectoryStore(),
    });
    const source = createFakeResearchSource({
      firms: [
        {
          kind: "firm",
          companyName: "Firm One",
          websiteUrl: "https://firm-one.example",
          evidence: testEvidence("https://firm-one.example/evidence"),
          reason: "Technology recruitment",
          industries: ["Financial services"],
          rankingSignals: {
            currentMandatesOrActivity: true,
            namedRecruiterOrTeamEvidence: true,
            scaleOrTrackRecord: true,
            targetMarkets: ["United Arab Emirates"],
          },
          specialisms: ["Software engineering"],
        },
      ],
      recruiters: [
        {
          kind: "recruiter",
          name: "Amina Khan",
          title: "Technology Recruiter",
          companyName: "Firm One",
          profileUrl: "https://www.linkedin.com/in/amina-khan",
          evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
        },
      ],
    });
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun("run-1");

    expect((await runs.get("run-1"))?.checkpoint).toBe("completed");
    expect((await runs.get("run-1"))?.status).toBe("completed");
    expect((await runs.observationsFor("run-1")).map((observation) => observation.kind)).toEqual([
      "firm",
      "recruiter",
    ]);
    await expect(directory.getDirectory()).resolves.toMatchObject({
      firms: [expect.objectContaining({ name: "Firm One" })],
      recruiters: [expect.objectContaining({ name: "Amina Khan" })],
    });
  });

  it("records an unavailable frozen policy before making an adapter request", async () => {
    const run = sampleRun("run-unavailable");
    const runs = createFakeResearchRunStore([run]);
    const directory = emptyDirectory();
    const findFirms = vi.fn(async ({ reserveRequest }) => {
      await reserveRequest();
      return [];
    });
    const source: ResearchSource = {
      adapterId: "unavailable-source",
      assess: () => ({ available: false, message: "The source plan is disabled." }),
      findFirms,
      findRecruiters: vi.fn(async () => []),
    };
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun(run.id);

    expect(findFirms).not.toHaveBeenCalled();
    expect((await runs.get(run.id))?.status).toBe("failed");
    await expect(runs.failuresFor(run.id)).resolves.toEqual([
      expect.objectContaining({ message: "The source plan is disabled.", stage: "firms" }),
    ]);
  });

  it("exhausts a frozen stage allowance before making an adapter request", async () => {
    const run = createResearchRun({
      id: "run-budget-exhausted",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: {
        ...testSourcePlan,
        stageRequestAllowance: { firms: 0, recruiters: 1 },
      },
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const runs = createFakeResearchRunStore([run]);
    const directory = emptyDirectory();
    const findFirms = vi.fn(async () => []);
    const source: ResearchSource = {
      adapterId: "available-source",
      assess: () => ({ available: true }),
      findFirms,
      findRecruiters: vi.fn(async () => []),
    };
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun(run.id);

    expect(findFirms).not.toHaveBeenCalled();
    expect(await runs.get(run.id)).toMatchObject({
      budgetExhaustion: { reason: "stage-request-allowance-reached", stage: "firms" },
      status: "failed",
    });
  });

  it("keeps committed firm observations when the recruiter stage fails", async () => {
    const run = sampleRun("run-partial");
    const runs = createFakeResearchRunStore([run]);
    const directory = emptyDirectory();
    const firm = {
      kind: "firm" as const,
      companyName: "Firm One",
      websiteUrl: "https://firm-one.example",
      evidence: testEvidence("https://firm-one.example/evidence"),
      reason: "Technology recruitment",
      industries: ["Financial services"],
      rankingSignals: {
        currentMandatesOrActivity: true,
        namedRecruiterOrTeamEvidence: false,
        scaleOrTrackRecord: false,
        targetMarkets: ["United Arab Emirates"],
      },
      specialisms: ["Software engineering"],
    };
    const source: ResearchSource = {
      adapterId: "partial-source",
      assess: () => ({ available: true }),
      findFirms: async ({ reserveRequest }) => ((await reserveRequest()) ? [firm] : []),
      findRecruiters: async ({ reserveRequest }) => {
        await reserveRequest();
        throw new Error("The recruiter source stage was unavailable.");
      },
    };
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun(run.id);

    expect((await runs.get(run.id))?.status).toBe("partial");
    await expect(runs.observationsFor(run.id)).resolves.toEqual([firm]);
    await expect(directory.getDirectory()).resolves.toMatchObject({
      firms: [expect.objectContaining({ name: "Firm One" })],
      recruiters: [],
    });
    await expect(runs.failuresFor(run.id)).resolves.toEqual([
      expect.objectContaining({ stage: "recruiters" }),
    ]);
  });

  it("retains recruiter observations returned before the request allowance is exhausted", async () => {
    const run = sampleRun("run-recruiter-budget-partial");
    const runs = createFakeResearchRunStore([run]);
    const directory = emptyDirectory();
    const firm = firmObservation("Firm One", "https://firm-one.example", {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: true,
      targetMarkets: ["United Arab Emirates"],
    });
    const recruiter = {
      companyName: firm.companyName,
      evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
      kind: "recruiter" as const,
      name: "Amina Khan",
      profileUrl: "https://www.linkedin.com/in/amina-khan",
      title: "Technology Recruiter",
    };
    const source: ResearchSource = {
      adapterId: "budget-source",
      assess: () => ({ available: true }),
      findFirms: async ({ reserveRequest }) => ((await reserveRequest()) ? [firm] : []),
      findRecruiters: async ({ reserveRequest }) => {
        expect(await reserveRequest()).toBe(true);
        expect(await reserveRequest()).toBe(false);
        return [recruiter];
      },
    };
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun(run.id);

    expect(await runs.get(run.id)).toMatchObject({
      budgetExhaustion: { stage: "recruiters" },
      status: "partial",
    });
    await expect(runs.observationsFor(run.id)).resolves.toEqual([firm, recruiter]);
    await expect(directory.getDirectory()).resolves.toMatchObject({
      recruiters: [expect.objectContaining({ name: "Amina Khan" })],
    });
  });

  it("runs recruiter research for every qualified firm and excludes firms without qualification evidence", async () => {
    const run = sampleRun("run-qualified-firms");
    const runs = createFakeResearchRunStore([run]);
    const directory = emptyDirectory();
    const qualifiedFirm = firmObservation("Qualified Search", "https://qualified.example", {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: false,
      scaleOrTrackRecord: false,
      targetMarkets: ["United Arab Emirates"],
    });
    const unqualifiedFirm = firmObservation("Unqualified Search", "https://unqualified.example", {
      currentMandatesOrActivity: false,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: true,
      targetMarkets: [],
    });
    const findRecruiters = vi.fn(
      async (_request: Parameters<ResearchSource["findRecruiters"]>[0]) => [],
    );
    const source: ResearchSource = {
      adapterId: "qualification-source",
      assess: () => ({ available: true }),
      findFirms: async ({ reserveRequest }) =>
        (await reserveRequest()) ? [qualifiedFirm, unqualifiedFirm] : [],
      findRecruiters: async (request) => {
        await request.reserveRequest();
        return findRecruiters(request);
      },
    };
    const execution = createResearchRunExecution({
      directory,
      now: () => new Date("2026-08-27T10:01:00.000Z"),
      runs,
      source,
    });

    await execution.executeResearchRun(run.id);

    expect(findRecruiters).toHaveBeenCalledWith({
      firms: [qualifiedFirm],
      reserveRequest: expect.any(Function),
      run: expect.any(Object),
    });
    await expect(runs.observationsFor(run.id)).resolves.toEqual([qualifiedFirm, unqualifiedFirm]);
  });
});

function emptyDirectory() {
  return createRecruiterDirectoryMaintenance({ store: createFakeRecruiterDirectoryStore() });
}

function sampleRun(id: string) {
  return createResearchRun({
    id,
    brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
    policy: testAdapterPolicy,
    sourcePlan: testSourcePlan,
    startedAt: new Date("2026-08-27T10:00:00.000Z"),
  });
}

function firmObservation(
  companyName: string,
  websiteUrl: string,
  rankingSignals: {
    readonly currentMandatesOrActivity: boolean;
    readonly namedRecruiterOrTeamEvidence: boolean;
    readonly scaleOrTrackRecord: boolean;
    readonly targetMarkets: readonly string[];
  },
) {
  return {
    kind: "firm" as const,
    companyName,
    websiteUrl,
    evidence: testEvidence(`${websiteUrl}/evidence`),
    reason: "Technology recruitment",
    industries: ["Financial services"],
    rankingSignals,
    specialisms: ["Software engineering"],
  };
}
