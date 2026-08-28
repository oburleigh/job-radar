import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  createLocalCodexAdapterPolicy,
  createPublicRecruiterSourcePlan,
} from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-policy";
import {
  createLocalCodexResearchSource,
  type LocalCodexProcess,
  type LocalCodexProcessRequest,
} from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-research-source";

export type RecruiterResearchCompany = {
  readonly name: string;
  readonly websiteUrl: string;
  readonly reason: string;
  readonly industries: readonly string[];
  readonly specialisms: readonly string[];
  readonly evidenceExcerpt: string;
  readonly observationDate: string;
};

export type RecruiterResearchRecruiter = {
  readonly name: string;
  readonly title: string;
  readonly company: string;
  readonly linkedInUrl: string;
  readonly evidenceExcerpt: string;
  readonly observationDate: string;
  readonly workEmail?: string;
  readonly workEmailEvidenceExcerpt?: string;
};

export type RecruiterResearchResult = {
  readonly observationDate: string;
  readonly companies: readonly RecruiterResearchCompany[];
  readonly recruiters: readonly RecruiterResearchRecruiter[];
};

export type RecruiterResearchProcessRequest = LocalCodexProcessRequest;
export type RecruiterResearchProcess = LocalCodexProcess;

export interface RunRecruiterResearchOptions {
  readonly brief?: string;
  readonly command?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly process: RecruiterResearchProcess;
  readonly recruiterTarget?: number;
  readonly settings: RecruiterResearchSettings;
  readonly targetLocations: readonly string[];
}

export async function runRecruiterResearch(
  options: RunRecruiterResearchOptions,
): Promise<RecruiterResearchResult> {
  const recruiterTarget = requestedRecruiterTarget(
    options.recruiterTarget,
    options.settings.defaultBrief.recruiterTarget,
  );
  const run = createResearchRun({
    id: "cli-research",
    brief: createSearchBrief({
      description: options.brief?.trim() || options.settings.defaultBrief.description,
      criteria: {
        ...options.settings.defaultBrief.criteria,
        targetLocations: options.targetLocations,
      },
      firmTarget: options.settings.defaultBrief.firmTarget,
      recruiterTarget,
    }),
    policy: createLocalCodexAdapterPolicy(options.settings),
    sourcePlan: createPublicRecruiterSourcePlan(options.settings),
    startedAt: new Date(),
  });
  const source = createLocalCodexResearchSource({
    ...(options.command ? { command: options.command } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
    process: options.process,
    stageTimeoutMs: options.settings.execution.stageTimeoutMs,
  });
  const firms = await source.findFirms({ run });
  const recruiters = await source.findRecruiters({ run, firms });
  const observationDate = firms[0]?.evidence.observedAt ?? recruiters[0]?.evidence.observedAt;
  if (!observationDate) {
    throw new Error("Codex returned no observations.");
  }
  return {
    observationDate,
    companies: firms.map(({ companyName, evidence, kind: _kind, ...company }) => ({
      name: companyName,
      evidenceExcerpt: evidence.excerpt,
      observationDate: evidence.observedAt,
      ...company,
    })),
    recruiters: recruiters.map(
      ({ companyName, evidence, kind: _kind, workEmail, ...recruiter }) => ({
        company: companyName,
        evidenceExcerpt: evidence.excerpt,
        observationDate: evidence.observedAt,
        ...recruiter,
        ...(workEmail
          ? {
              workEmail: workEmail.address,
              workEmailEvidenceExcerpt: workEmail.evidence.excerpt,
            }
          : {}),
      }),
    ),
  };
}

function requestedRecruiterTarget(value: number | undefined, configuredDefault: number): number {
  const recruiterTarget = value ?? configuredDefault;
  if (!Number.isSafeInteger(recruiterTarget) || recruiterTarget <= 0) {
    throw new Error("recruiterTarget must be a positive integer.");
  }
  return recruiterTarget;
}
