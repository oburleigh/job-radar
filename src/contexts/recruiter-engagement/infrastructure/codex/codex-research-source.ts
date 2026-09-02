import type { ResearchSource } from "@/contexts/recruiter-engagement/application/research-runs/port";
import type { ResearchExecutionSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import type {
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import { type CodexClient, CodexFailure } from "./codex-cli-client";
import { codexAdapterId } from "./codex-policy";
import { firmDiscoveryInstructions, recruiterDiscoveryInstructions } from "./codex-research-prompt";
import {
  type CodexFirm,
  type CodexRecruiter,
  codexFirmJsonSchema,
  codexFirmReplySchema,
  codexFirmSchema,
  codexRecruiterJsonSchema,
  codexRecruiterReplySchema,
  codexRecruiterSchema,
} from "./codex-research-schema";

type CodexResearchSourceOptions = {
  readonly client: CodexClient;
  readonly execution: () => ResearchExecutionSettings;
  readonly failures?: {
    readonly record: (failure: {
      readonly adapterId: string;
      readonly message: string;
      readonly recordedAt: Date;
      readonly runId: string;
      readonly stage: "firms" | "recruiters";
    }) => Promise<void>;
  };
  readonly now: () => Date;
};

export function createCodexResearchSource(options: CodexResearchSourceOptions): ResearchSource {
  async function complete(request: {
    readonly instructions: string;
    readonly outputSchema: unknown;
    readonly run: ResearchRun;
    readonly signal?: AbortSignal | undefined;
    readonly stage: "firms" | "recruiters";
  }): Promise<string> {
    try {
      return await options.client.complete({
        execution: options.execution(),
        instructions: request.instructions,
        outputSchema: request.outputSchema,
        ...(request.signal ? { signal: request.signal } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await options.failures?.record({
        adapterId: codexAdapterId,
        message,
        recordedAt: options.now(),
        runId: request.run.id,
        stage: request.stage,
      });
      throw error instanceof CodexFailure
        ? error
        : new CodexFailure({ cause: error, code: "codex-invocation-failed", message });
    }
  }

  async function reportProblem(
    problem: string | undefined,
    run: ResearchRun,
    stage: "firms" | "recruiters",
  ): Promise<void> {
    if (!problem) return;
    await options.failures?.record({
      adapterId: codexAdapterId,
      message: problem,
      recordedAt: options.now(),
      runId: run.id,
      stage,
    });
  }

  return {
    adapterId: codexAdapterId,
    assess(run) {
      if (!run.policy.enabled) return { available: false, message: run.policy.disabledBehavior };
      if (run.policy.id !== codexAdapterId) {
        return {
          available: false,
          message: "The frozen Adapter policy does not permit the local Codex Source.",
        };
      }
      return { available: true };
    },
    async findFirms({ reserveRequest, run, signal }) {
      if (!(await reserveRequest())) return [];
      const reply = await complete({
        instructions: firmDiscoveryInstructions(run),
        outputSchema: codexFirmJsonSchema,
        run,
        signal,
        stage: "firms",
      });
      const observedAt = options.now();
      const result = retained<CodexFirm>(reply, "firms", codexFirmReplySchema, codexFirmSchema);
      await reportProblem(result.problem, run, "firms");
      return result.items
        .slice(0, run.brief.firmTarget)
        .map((firm) => toFirmObservation(firm, run, observedAt));
    },
    async findRecruiters({ firms, reserveRequest, run, signal }) {
      if (firms.length === 0) return [];
      if (!(await reserveRequest())) return [];
      const reply = await complete({
        instructions: recruiterDiscoveryInstructions(run, firms),
        outputSchema: codexRecruiterJsonSchema,
        run,
        signal,
        stage: "recruiters",
      });
      const observedAt = options.now();
      const result = retained<CodexRecruiter>(
        reply,
        "recruiters",
        codexRecruiterReplySchema,
        codexRecruiterSchema,
      );
      await reportProblem(result.problem, run, "recruiters");
      return result.items
        .slice(0, run.brief.recruiterTarget)
        .map((recruiter) => toRecruiterObservation(recruiter, run, observedAt));
    },
  };
}

function retained<TItem>(
  reply: string,
  key: "firms" | "recruiters",
  replySchema: { readonly safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  itemSchema: { readonly safeParse: (value: unknown) => { success: boolean; data?: TItem } },
): { readonly items: TItem[]; readonly problem?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return { items: [], problem: "The Codex reply was not valid JSON." };
  }
  const whole = replySchema.safeParse(parsed);
  if (whole.success) {
    return { items: ((whole.data as Record<string, TItem[]>)[key] ?? []) as TItem[] };
  }
  if (!parsed || typeof parsed !== "object") {
    return { items: [], problem: "The Codex reply was not an object." };
  }
  const items = (parsed as Record<string, unknown>)[key];
  if (!Array.isArray(items)) {
    return { items: [], problem: `The Codex reply carried no ${key} array.` };
  }
  const retainedItems: TItem[] = [];
  let rejected = 0;
  for (const item of items) {
    const result = itemSchema.safeParse(item);
    if (result.success && result.data !== undefined) retainedItems.push(result.data);
    else rejected += 1;
  }
  return {
    items: retainedItems,
    problem: `The Codex reply carried ${rejected} ${key} record${rejected === 1 ? "" : "s"} that did not match the contract.`,
  };
}

function toFirmObservation(firm: CodexFirm, run: ResearchRun, observedAt: Date): FirmObservation {
  return {
    kind: "firm",
    companyName: firm.companyName,
    websiteUrl: firm.websiteUrl,
    reason: firm.reason,
    industries: firm.industries,
    specialisms: firm.specialisms,
    rankingSignals: {
      currentMandatesOrActivity: firm.hasCurrentMandatesOrActivity,
      namedRecruiterOrTeamEvidence: firm.hasNamedRecruiterOrTeamEvidence,
      scaleOrTrackRecord: firm.hasScaleOrTrackRecord,
      targetMarkets: firm.targetMarkets,
    },
    evidence: {
      adapterId: run.policy.id,
      confidence: firm.confidence,
      excerpt: firm.excerpt,
      observedAt: observedAt.toISOString().slice(0, 10),
      policyVersion: run.policy.version,
      sourceUrl: firm.sourceUrl,
    },
  };
}

function toRecruiterObservation(
  recruiter: CodexRecruiter,
  run: ResearchRun,
  observedAt: Date,
): RecruiterObservation {
  return {
    kind: "recruiter",
    name: recruiter.name,
    title: recruiter.title,
    companyName: recruiter.companyName,
    profileUrl: recruiter.profileUrl,
    evidence: {
      adapterId: run.policy.id,
      confidence: recruiter.confidence,
      excerpt: recruiter.excerpt,
      observedAt: observedAt.toISOString().slice(0, 10),
      policyVersion: run.policy.version,
      sourceUrl: recruiter.sourceUrl,
    },
  };
}
