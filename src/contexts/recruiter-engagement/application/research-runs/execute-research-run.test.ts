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
    const findFirms = vi.fn(async () => []);
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
      specialisms: ["Software engineering"],
    };
    const source: ResearchSource = {
      adapterId: "partial-source",
      assess: () => ({ available: true }),
      findFirms: async () => [firm],
      findRecruiters: async () => {
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
