import { describe, expect, it, vi } from "vitest";
import type { ResearchExecutionSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import { defaultRecruiterResearchSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { CodexFailure, type CodexRequest } from "./codex-cli-client";
import { codexAdapterId, createCodexSourcePlan } from "./codex-policy";
import { createCodexResearchSource } from "./codex-research-source";

type MutableExecutionSettings = {
  -readonly [Key in keyof ResearchExecutionSettings]: ResearchExecutionSettings[Key];
};

const frozenExecution = {
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  stageTimeoutMs: 600_000,
} as const;

const observedAt = new Date("2026-09-01T00:00:00.000Z");

function researchRun(firmTarget = 3, recruiterTarget = 6) {
  return createResearchRun({
    brief: testSearchBrief({ firmTarget, recruiterTarget }),
    id: "run-codex",
    policy: { ...testAdapterPolicy, id: codexAdapterId },
    sourcePlan: { ...testSourcePlan, execution: frozenExecution, publicSearch: null },
    startedAt: observedAt,
  });
}

const run = researchRun();

const unfrozenRun = createResearchRun({
  brief: testSearchBrief(),
  id: "run-codex-legacy",
  policy: { ...testAdapterPolicy, id: codexAdapterId },
  sourcePlan: { ...testSourcePlan, execution: null, publicSearch: null },
  startedAt: observedAt,
});

function firmReply(count: number) {
  return JSON.stringify({
    firms: Array.from({ length: count }, (_, index) => ({
      companyName: `Firm ${index + 1}`,
      confidence: "high",
      excerpt: "We recruit software engineers in the UAE.",
      hasCurrentMandatesOrActivity: true,
      hasNamedRecruiterOrTeamEvidence: true,
      hasScaleOrTrackRecord: false,
      industries: ["Technology"],
      reason: "Places software engineering roles in the UAE.",
      sourceUrl: `https://firm-${index + 1}.com/about`,
      specialisms: ["Software engineering"],
      targetMarkets: ["United Arab Emirates"],
      websiteUrl: `https://firm-${index + 1}.com`,
    })),
  });
}

function recruiterReply(count: number) {
  return JSON.stringify({
    recruiters: Array.from({ length: count }, (_, index) => ({
      companyName: "Firm 1",
      confidence: "medium",
      excerpt: `Recruiter ${index + 1} leads technology hiring.`,
      name: `Recruiter ${index + 1}`,
      profileUrl: `https://profiles.example.com/in/recruiter-${index + 1}`,
      sourceUrl: "https://firm-1.com/team",
      title: "Principal Consultant",
    })),
  });
}

function recordingSource(
  complete: (request: CodexRequest) => Promise<string>,
  record: (failure: {
    readonly adapterId: string;
    readonly message: string;
    readonly recordedAt: Date;
    readonly runId: string;
    readonly stage: "firms" | "recruiters";
  }) => Promise<void>,
) {
  return createCodexResearchSource({
    client: { complete },
    failures: { record },
    now: () => observedAt,
  });
}

function source(complete: (request: CodexRequest) => Promise<string>, failures?: never) {
  return createCodexResearchSource({
    client: { complete },
    now: () => observedAt,
    ...(failures ? { failures } : {}),
  });
}

const observedFirms: readonly FirmObservation[] = [
  {
    kind: "firm",
    companyName: "Firm 1",
    websiteUrl: "https://firm-1.com",
    reason: "Places software engineering roles.",
    industries: ["Technology"],
    specialisms: ["Software engineering"],
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: false,
      targetMarkets: ["United Arab Emirates"],
    },
    evidence: {
      adapterId: codexAdapterId,
      confidence: "high",
      excerpt: "We recruit software engineers.",
      observedAt: "2026-09-01",
      policyVersion: "1",
      sourceUrl: "https://firm-1.com/about",
    },
  },
];

describe("codex research source", () => {
  it("refuses a run frozen against another adapter", () => {
    const other = createResearchRun({
      brief: testSearchBrief(),
      id: "run-other",
      policy: { ...testAdapterPolicy, id: "public-web-search:serper:v1" },
      sourcePlan: testSourcePlan,
      startedAt: observedAt,
    });
    expect(source(async () => firmReply(1)).assess(other).available).toBe(false);
  });

  it("accepts a run frozen against the Codex adapter and no public search policy", () => {
    expect(source(async () => firmReply(1)).assess(run).available).toBe(true);
  });

  it("returns firm observations mapped from the reply", async () => {
    const firms = await source(async () => firmReply(3)).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(3);
    expect(firms[0]).toMatchObject({
      kind: "firm",
      companyName: "Firm 1",
      websiteUrl: "https://firm-1.com",
      rankingSignals: { currentMandatesOrActivity: true, scaleOrTrackRecord: false },
      evidence: {
        adapterId: codexAdapterId,
        confidence: "high",
        observedAt: "2026-09-01",
        sourceUrl: "https://firm-1.com/about",
      },
    });
  });

  it("never returns more firms than the run's firm target", async () => {
    const firms = await source(async () => firmReply(25)).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(3);
  });

  it("spends one stage request for the firms stage", async () => {
    const reserveRequest = vi.fn(async () => true);
    await source(async () => firmReply(1)).findFirms({ reserveRequest, run });
    expect(reserveRequest).toHaveBeenCalledTimes(1);
  });

  it("returns nothing and calls Codex not at all when the allowance is spent", async () => {
    const complete = vi.fn(async () => firmReply(1));
    const firms = await source(complete).findFirms({ reserveRequest: async () => false, run });
    expect(firms).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("drops a firm that fails the contract rather than failing the stage", async () => {
    const mixed = JSON.stringify({
      firms: [JSON.parse(firmReply(1)).firms[0], { companyName: "Fabricated" }],
    });
    const firms = await source(async () => mixed).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(1);
    expect(firms[0]?.companyName).toBe("Firm 1");
  });

  it("returns nothing when the reply is not JSON at all", async () => {
    const firms = await source(async () => "I could not find any firms.").findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toEqual([]);
  });

  it("passes the run's frozen model, reasoning effort and stage timeout to the client", async () => {
    const complete = vi.fn(async () => firmReply(1));
    const frozen = researchRun();
    await source(complete).findFirms({ reserveRequest: async () => true, run: frozen });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ execution: frozenExecution }));
  });

  it("sends each run its own frozen execution rather than a shared one", async () => {
    const sent: unknown[] = [];
    const complete = async (request: CodexRequest) => {
      sent.push(request.execution);
      return firmReply(1);
    };
    const other = createResearchRun({
      brief: testSearchBrief(),
      id: "run-codex-other",
      policy: { ...testAdapterPolicy, id: codexAdapterId },
      sourcePlan: {
        ...testSourcePlan,
        execution: { model: "gpt-5.6-terra", reasoningEffort: "low", stageTimeoutMs: 90_000 },
        publicSearch: null,
      },
      startedAt: observedAt,
    });
    const codex = source(complete);
    await codex.findFirms({ reserveRequest: async () => true, run });
    await codex.findFirms({ reserveRequest: async () => true, run: other });
    expect(sent).toEqual([
      frozenExecution,
      { model: "gpt-5.6-terra", reasoningEffort: "low", stageTimeoutMs: 90_000 },
    ]);
  });

  it("snapshots the settings by value, so a later change to them cannot reach a stage", async () => {
    const execution: MutableExecutionSettings = {
      ...defaultRecruiterResearchSettings.execution,
    };
    const started = createResearchRun({
      brief: testSearchBrief(),
      id: "run-codex-frozen",
      policy: { ...testAdapterPolicy, id: codexAdapterId },
      sourcePlan: createCodexSourcePlan({ ...defaultRecruiterResearchSettings, execution }),
      startedAt: observedAt,
    });
    const sent: unknown[] = [];
    const codex = source(async (request: CodexRequest) => {
      sent.push(request.execution);
      return sent.length === 1 ? firmReply(1) : recruiterReply(1);
    });

    await codex.findFirms({ reserveRequest: async () => true, run: started });
    execution.model = "changed-mid-run";
    execution.reasoningEffort = "low";
    execution.stageTimeoutMs = 1_000;
    await codex.findRecruiters({
      firms: observedFirms,
      reserveRequest: async () => true,
      run: started,
    });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1]).toEqual({
      model: defaultRecruiterResearchSettings.execution.model,
      reasoningEffort: defaultRecruiterResearchSettings.execution.reasoningEffort,
      stageTimeoutMs: defaultRecruiterResearchSettings.execution.stageTimeoutMs,
    });
  });

  it("fails the stage rather than guessing when a caller skips the assessment", async () => {
    const complete = vi.fn(async () => firmReply(1));
    await expect(
      source(complete).findFirms({ reserveRequest: async () => true, run: unfrozenRun }),
    ).rejects.toMatchObject({ code: "codex-execution-not-frozen" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses a run whose source plan froze no execution settings", () => {
    const assessment = source(async () => firmReply(1)).assess(unfrozenRun);
    expect(assessment.available).toBe(false);
    expect(assessment.available === false && assessment.message).toMatch(/execution/i);
  });

  it("asks for the run's own target in the instructions it sends", async () => {
    let sent = "";
    const complete = async (request: CodexRequest) => {
      sent = request.instructions;
      return firmReply(1);
    };
    await source(complete).findFirms({ reserveRequest: async () => true, run });
    expect(sent).toContain("3");
  });

  it("records a source failure and rethrows when Codex fails", async () => {
    const record = vi.fn(async () => {});
    const failing = createCodexResearchSource({
      client: {
        complete: async () => {
          throw new CodexFailure({ code: "codex-invocation-failed", message: "codex exited 3" });
        },
      },
      failures: { record },
      now: () => observedAt,
    });

    await expect(failing.findFirms({ reserveRequest: async () => true, run })).rejects.toThrow(
      /codex exited 3/,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ adapterId: codexAdapterId, runId: run.id, stage: "firms" }),
    );
  });

  it("records a source failure when the Codex reply is not valid JSON", async () => {
    const record = vi.fn(async () => {});
    const firms = await recordingSource(async () => "not json at all", record).findFirms({
      reserveRequest: async () => true,
      run,
    });

    expect(firms).toEqual([]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterId: codexAdapterId,
        message: expect.stringContaining("valid JSON"),
        runId: run.id,
        stage: "firms",
      }),
    );
  });

  it("records a source failure when the reply carries no firms array", async () => {
    const record = vi.fn(async () => {});
    const firms = await recordingSource(
      async () => JSON.stringify({ results: [] }),
      record,
    ).findFirms({ reserveRequest: async () => true, run });

    expect(firms).toEqual([]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("firms"), stage: "firms" }),
    );
  });

  it("retains the valid records and reports how many were rejected", async () => {
    const record = vi.fn(async () => {});
    const reply = JSON.parse(firmReply(1)) as { firms: unknown[] };
    reply.firms.push({ companyName: "Broken" }, { companyName: "Also broken" });

    const firms = await recordingSource(async () => JSON.stringify(reply), record).findFirms({
      reserveRequest: async () => true,
      run,
    });

    expect(firms).toHaveLength(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The Codex reply carried 2 firms records that did not match the contract.",
        stage: "firms",
      }),
    );
  });

  it("records a source failure when the reply is null rather than an object", async () => {
    const record = vi.fn(async () => {});
    const firms = await recordingSource(async () => "null", record).findFirms({
      reserveRequest: async () => true,
      run,
    });

    expect(firms).toEqual([]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The Codex reply was not an object.",
        stage: "firms",
      }),
    );
  });

  it("records nothing when the reply is a valid empty result", async () => {
    const record = vi.fn(async () => {});
    const firms = await recordingSource(
      async () => JSON.stringify({ firms: [] }),
      record,
    ).findFirms({ reserveRequest: async () => true, run });

    expect(firms).toEqual([]);
    expect(record).not.toHaveBeenCalled();
  });

  it("records a source failure when the recruiter reply is malformed", async () => {
    const record = vi.fn(async () => {});
    const recruiters = await recordingSource(async () => "{", record).findRecruiters({
      firms: observedFirms,
      reserveRequest: async () => true,
      run,
    });

    expect(recruiters).toEqual([]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ stage: "recruiters" }));
  });

  it("returns recruiter observations for the firms it is given", async () => {
    const recruiters = await source(async () => recruiterReply(2)).findRecruiters({
      firms: observedFirms,
      reserveRequest: async () => true,
      run,
    });
    expect(recruiters).toHaveLength(2);
    expect(recruiters[0]).toMatchObject({
      kind: "recruiter",
      companyName: "Firm 1",
      name: "Recruiter 1",
      profileUrl: "https://profiles.example.com/in/recruiter-1",
    });
  });

  it("never returns more recruiters than the run's recruiter target", async () => {
    const recruiters = await source(async () => recruiterReply(50)).findRecruiters({
      firms: observedFirms,
      reserveRequest: async () => true,
      run,
    });
    expect(recruiters).toHaveLength(6);
  });

  it("does not call Codex when the recruiter stage has no qualified firms", async () => {
    const complete = vi.fn(async () => recruiterReply(1));
    const recruiters = await source(complete).findRecruiters({
      firms: [],
      reserveRequest: async () => true,
      run,
    });
    expect(recruiters).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});
