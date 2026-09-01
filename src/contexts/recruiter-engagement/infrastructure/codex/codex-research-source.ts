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
  codexFirmSchema,
  codexRecruiterJsonSchema,
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
      return retained(reply, "firms", codexFirmSchema)
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
      return retained(reply, "recruiters", codexRecruiterSchema)
        .slice(0, run.brief.recruiterTarget)
        .map((recruiter) => toRecruiterObservation(recruiter, run, observedAt));
    },
  };
}

function retained<TItem>(
  reply: string,
  key: "firms" | "recruiters",
  schema: { readonly safeParse: (value: unknown) => { success: boolean; data?: TItem } },
): TItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const items = (parsed as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return [];
  const retainedItems: TItem[] = [];
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success && result.data !== undefined) retainedItems.push(result.data);
  }
  return retainedItems;
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
