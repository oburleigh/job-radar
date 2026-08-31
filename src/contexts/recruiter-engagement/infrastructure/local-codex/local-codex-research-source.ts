import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";
import type { ResearchSource } from "@/contexts/recruiter-engagement/application/research-runs/port";
import type {
  Evidence,
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";

const POLICY_ID = "local-codex-cli-web-search-v1";
const POLICY_VERSION = "1";

const observedAt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const httpsUrl = z.url().refine((value) => value.startsWith("https://"), "Expected an HTTPS URL.");
const attributableExcerpt = z.string().min(1).max(280);
const evidence = z
  .object({
    adapterId: z.literal(POLICY_ID),
    confidence: z.enum(["high", "medium", "low"]),
    excerpt: attributableExcerpt,
    observedAt,
    policyVersion: z.literal(POLICY_VERSION),
    sourceUrl: httpsUrl,
  })
  .strict() as z.ZodType<Evidence>;
const firmObservation = z
  .object({
    companyName: z.string().min(1),
    websiteUrl: httpsUrl,
    reason: z.string().min(1),
    industries: z.array(z.string().min(1)).min(1),
    specialisms: z.array(z.string().min(1)).min(1),
    evidence,
  })
  .strict()
  .transform((value): FirmObservation => ({ kind: "firm", ...value }));
const recruiterObservation = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1),
    companyName: z.string().min(1),
    profileUrl: httpsUrl.refine(
      (value) => /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s]+$/i.test(value),
      "Expected a public LinkedIn profile URL.",
    ),
    evidence: evidence.refine(
      (value) => /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s]+$/i.test(value.sourceUrl),
      "Expected public LinkedIn profile evidence.",
    ),
  })
  .strict()
  .transform((value): RecruiterObservation => ({ kind: "recruiter", ...value }));

export interface LocalCodexProcessRequest {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
}

export interface LocalCodexProcess {
  readonly run: (request: LocalCodexProcessRequest) => Promise<{
    readonly diagnostic?: string;
    readonly exitCode: number;
  }>;
}

type LocalCodexResearchSourceOptions = {
  readonly command?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly process: LocalCodexProcess;
  readonly stageTimeoutMs: number;
};

export function createLocalCodexResearchSource(
  options: LocalCodexResearchSourceOptions,
): ResearchSource {
  return {
    adapterId: "local-codex-cli-web-search-v1",
    assess(run) {
      return assessLocalCodexRun(run);
    },
    async findFirms({ run, signal }) {
      assertLocalCodexRunIsAvailable(run);
      const companyTarget = run.budget.firmTarget;
      const value = await runStage({
        command: options.command ?? "codex",
        execution: run.policy.execution,
        environment: options.environment ?? process.env,
        process: options.process,
        outputSchema: firmOutputSchema(companyTarget),
        prompt: firmPrompt(run, companyTarget),
        stage: "firm",
        stageTimeoutMs: options.stageTimeoutMs,
        ...(signal ? { signal } : {}),
      });
      const parsed = z
        .object({ companies: z.array(firmObservation).min(companyTarget) })
        .strict()
        .safeParse(value);
      if (!parsed.success) {
        throw new Error(
          `Codex firm-stage output is invalid: ${parsed.error.issues[0]?.message ?? "Unknown schema error."}`,
        );
      }
      ensureDistinctCompanies(parsed.data.companies);
      ensureEvidenceMatchesFrozenPlan(parsed.data.companies, run, "firms");
      return parsed.data.companies;
    },
    async findRecruiters({ run, firms, signal }) {
      assertLocalCodexRunIsAvailable(run);
      const value = await runStage({
        command: options.command ?? "codex",
        execution: run.policy.execution,
        environment: options.environment ?? process.env,
        process: options.process,
        outputSchema: recruiterOutputSchema(run.brief.recruiterTarget),
        prompt: recruiterPrompt(run, firms),
        stage: "recruiter",
        stageTimeoutMs: options.stageTimeoutMs,
        ...(signal ? { signal } : {}),
      });
      const parsed = z
        .object({ recruiters: z.array(recruiterObservation).min(run.brief.recruiterTarget) })
        .strict()
        .safeParse(value);
      if (!parsed.success) {
        throw new Error(
          `Codex recruiter-stage output is invalid: ${parsed.error.issues[0]?.message ?? "Unknown schema error."}`,
        );
      }
      const recruiters = canonicaliseRecruiterCompanyNames(parsed.data.recruiters, firms);
      ensureEvidenceMatchesFrozenPlan(recruiters, run, "recruiters");
      return recruiters;
    },
  };
}

function assessLocalCodexRun(
  run: ResearchRun,
): { readonly available: true } | { readonly available: false; readonly message: string } {
  if (!run.policy.enabled) {
    return { available: false, message: run.policy.disabledBehavior };
  }
  if (run.policy.id !== POLICY_ID || run.policy.version !== POLICY_VERSION) {
    return {
      available: false,
      message: "The frozen adapter policy does not match local-codex-cli-web-search-v1.",
    };
  }
  if (
    run.policy.execution.automaticRetry ||
    !run.policy.execution.ephemeral ||
    run.policy.execution.sandboxMode !== "read-only" ||
    !run.policy.execution.webSearchEnabled
  ) {
    return {
      available: false,
      message: "The frozen execution policy is not compatible with the local Codex adapter.",
    };
  }
  if (run.sourcePlan.id !== "public-web-linkedin-v1") {
    return {
      available: false,
      message: "The frozen source plan is not supported by the local Codex adapter.",
    };
  }
  if (
    !run.policy.permittedOperations.includes("Public web search") ||
    !run.policy.permittedOperations.includes("Public LinkedIn profile-result research") ||
    !run.policy.allowedPublicSourceScope.includes("Public HTTPS firm pages") ||
    !run.policy.allowedPublicSourceScope.includes("Public LinkedIn profile results")
  ) {
    return {
      available: false,
      message: "The frozen adapter policy does not permit this public research plan.",
    };
  }
  if (
    run.policy.rateLimit.stageRequestLimit < 1 ||
    run.sourcePlan.stageRequestAllowance.firms > run.policy.rateLimit.stageRequestLimit ||
    run.sourcePlan.stageRequestAllowance.recruiters > run.policy.rateLimit.stageRequestLimit
  ) {
    return {
      available: false,
      message: "The frozen request allowance is outside the adapter policy.",
    };
  }
  const firmEntry = run.sourcePlan.entries.find((entry) => entry.stage === "firms");
  const recruiterEntry = run.sourcePlan.entries.find((entry) => entry.stage === "recruiters");
  if (
    !firmEntry?.allowedPublicSources.includes("Public HTTPS firm pages") ||
    !recruiterEntry?.allowedPublicSources.includes("Public LinkedIn profile results")
  ) {
    return {
      available: false,
      message: "The frozen source plan is outside the permitted public source scope.",
    };
  }
  if (
    firmEntry.adapterId !== run.policy.id ||
    firmEntry.policyVersion !== run.policy.version ||
    recruiterEntry.adapterId !== run.policy.id ||
    recruiterEntry.policyVersion !== run.policy.version
  ) {
    return {
      available: false,
      message: "The frozen source plan does not permit this adapter policy version.",
    };
  }
  return { available: true };
}

function assertLocalCodexRunIsAvailable(run: ResearchRun): void {
  const eligibility = assessLocalCodexRun(run);
  if (!eligibility.available) {
    throw new Error(eligibility.message);
  }
}

async function runStage(input: {
  readonly command: string;
  readonly execution: ResearchRun["policy"]["execution"];
  readonly environment: NodeJS.ProcessEnv;
  readonly process: LocalCodexProcess;
  readonly outputSchema: object;
  readonly prompt: string;
  readonly signal?: AbortSignal;
  readonly stage: "firm" | "recruiter";
  readonly stageTimeoutMs: number;
}): Promise<unknown> {
  const directory = await mkdtemp(path.join(tmpdir(), "job-radar-recruiter-research-"));
  const schemaPath = path.join(directory, "output-schema.json");
  const outputPath = path.join(directory, "final-output.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(input.outputSchema)}\n`, "utf8");
    const environment = { ...input.environment };
    delete environment.NODE_OPTIONS;
    delete environment.OPENAI_API_KEY;
    const timeoutSignal = AbortSignal.timeout(input.stageTimeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    let result: { readonly diagnostic?: string; readonly exitCode: number };
    try {
      result = await input.process.run({
        command: input.command,
        arguments: [
          ...(input.execution.webSearchEnabled ? ["--search"] : []),
          ...(input.execution.model ? ["-m", input.execution.model] : []),
          ...(input.execution.reasoningEffort
            ? ["-c", `model_reasoning_effort="${input.execution.reasoningEffort}"`]
            : []),
          "exec",
          ...(input.execution.ephemeral ? ["--ephemeral"] : []),
          "--skip-git-repo-check",
          "--sandbox",
          input.execution.sandboxMode,
          "--json",
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          "-C",
          directory,
          input.prompt,
        ],
        cwd: directory,
        environment,
        signal,
      });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new Error(
          `Local Codex ${input.stage} stage timed out after ${input.stageTimeoutMs}ms.`,
        );
      }
      throw error;
    }
    if (result.exitCode !== 0) {
      reportLocalCodexDiagnostic(input.stage, result.exitCode, result.diagnostic);
      throw new Error(localCodexRecoveryMessage(input.stage, result.exitCode, result.diagnostic));
    }
    try {
      return JSON.parse(await readFile(outputPath, "utf8"));
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new Error("Codex completed without final output.");
      }
      if (error instanceof SyntaxError) {
        throw new Error("Codex final output is not valid JSON.");
      }
      throw error;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function firmOutputSchema(companyTarget: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["companies"],
    properties: {
      companies: {
        type: "array",
        minItems: companyTarget,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "companyName",
            "websiteUrl",
            "reason",
            "industries",
            "specialisms",
            "evidence",
          ],
          properties: {
            companyName: { type: "string", minLength: 1 },
            websiteUrl: { type: "string", pattern: "^https://" },
            reason: { type: "string", minLength: 1 },
            industries: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            specialisms: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            evidence: evidenceOutputSchema({ source: "firm" }),
          },
        },
      },
    },
  } as const;
}

function recruiterOutputSchema(recruiterTarget: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["recruiters"],
    properties: {
      recruiters: {
        type: "array",
        minItems: recruiterTarget,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "title", "companyName", "profileUrl", "evidence"],
          properties: {
            name: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            companyName: { type: "string", minLength: 1 },
            profileUrl: { type: "string", pattern: "^https://.*linkedin\\.com/in/" },
            evidence: evidenceOutputSchema({ source: "linkedin" }),
          },
        },
      },
    },
  } as const;
}

function evidenceOutputSchema(input: { readonly source: "firm" | "linkedin" }) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["adapterId", "confidence", "excerpt", "observedAt", "policyVersion", "sourceUrl"],
    properties: {
      adapterId: { type: "string", const: POLICY_ID },
      confidence: { enum: ["high", "medium", "low"] },
      excerpt: { type: "string", minLength: 1, maxLength: 280 },
      observedAt: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      policyVersion: { type: "string", const: POLICY_VERSION },
      sourceUrl:
        input.source === "linkedin"
          ? { type: "string", pattern: "^https://.*linkedin\\.com/in/" }
          : { type: "string", pattern: "^https://" },
    },
  } as const;
}

function firmPrompt(run: ResearchRun, companyTarget: number): string {
  return [
    "Research public sources only for recruitment firms relevant to the supplied criteria.",
    `Invocation identity: ${run.id}:firms. This identifies one durable research stage.`,
    `Return at least ${companyTarget} distinct firms for this brief: ${run.brief.description}.`,
    `Target locations: ${run.brief.criteria.targetLocations.join(", ")}.`,
    `Specialisms: ${run.brief.criteria.specialisms.join(", ")}.`,
    `Target industries: ${run.brief.criteria.industries.join(", ")}.`,
    "Use public HTTPS firm sources. Do not access private, candidate, or contact data, logged-in LinkedIn sessions, cookies, LinkedIn DOM, messaging, browser or computer use, direct publisher crawling, or social automation.",
    "Return only JSON matching the provided schema.",
  ].join("\n");
}

function recruiterPrompt(run: ResearchRun, firms: readonly FirmObservation[]): string {
  return [
    "Research public LinkedIn search results only for named recruiters at the listed recruitment firms and supplied criteria.",
    `Invocation identity: ${run.id}:recruiters. This identifies one durable research stage.`,
    `Return at least ${run.brief.recruiterTarget} distinct named recruiters, with at least one recruiter for each listed firm.`,
    `Listed firms: ${firms.map((firm) => firm.companyName).join(", ")}.`,
    `Target locations: ${run.brief.criteria.targetLocations.join(", ")}.`,
    `Specialisms: ${run.brief.criteria.specialisms.join(", ")}.`,
    `Target industries: ${run.brief.criteria.industries.join(", ")}.`,
    "Use public HTTPS LinkedIn profile URLs. Do not access private, candidate, or contact data, logged-in LinkedIn sessions, cookies, LinkedIn DOM, messaging, browser or computer use, direct publisher crawling, or social automation.",
    "Return only JSON matching the provided schema.",
  ].join("\n");
}

function ensureDistinctCompanies(companies: readonly FirmObservation[]): void {
  const names = new Set(companies.map((company) => company.companyName.toLocaleLowerCase()));
  if (names.size !== companies.length) {
    throw new Error("Codex firm-stage output must use distinct company names.");
  }
}

function ensureEvidenceMatchesFrozenPlan(
  observations: readonly (FirmObservation | RecruiterObservation)[],
  run: ResearchRun,
  stage: "firms" | "recruiters",
): void {
  const entry = run.sourcePlan.entries.find((candidate) => candidate.stage === stage);
  if (!entry) {
    throw new Error(`The frozen source plan has no ${stage} entry.`);
  }
  for (const observation of observations) {
    const retainedEvidence = [
      observation.evidence,
      ...(observation.kind === "recruiter" && observation.workEmail
        ? [observation.workEmail.evidence]
        : []),
    ];
    if (
      retainedEvidence.some(
        (item) => item.adapterId !== entry.adapterId || item.policyVersion !== entry.policyVersion,
      )
    ) {
      throw new Error(`Codex ${stage}-stage evidence does not match the frozen source plan.`);
    }
  }
}

function canonicaliseRecruiterCompanyNames(
  recruiters: readonly RecruiterObservation[],
  firms: readonly FirmObservation[],
): readonly RecruiterObservation[] {
  const firmsByName = new Map(
    firms.map((firm) => [firm.companyName.toLocaleLowerCase(), firm.companyName]),
  );
  const firmsWithRecruiter = new Set<string>();
  const profileUrls = new Set<string>();
  const canonicalRecruiters = recruiters.map((recruiter) => {
    const profileUrl = normaliseProfileUrl(recruiter.profileUrl);
    if (profileUrl !== normaliseProfileUrl(recruiter.evidence.sourceUrl)) {
      throw new Error(
        "Codex recruiter-stage evidence must identify the displayed public LinkedIn profile.",
      );
    }
    if (profileUrls.has(profileUrl)) {
      throw new Error(
        "Codex recruiter-stage output must use distinct public LinkedIn profile URLs.",
      );
    }
    profileUrls.add(profileUrl);
    const companyKey = recruiter.companyName.toLocaleLowerCase();
    const companyName = firmsByName.get(companyKey);
    if (!companyName) {
      throw new Error(
        `Codex recruiter-stage output named an unplanned firm: ${recruiter.companyName}.`,
      );
    }
    firmsWithRecruiter.add(companyKey);
    return { ...recruiter, companyName };
  });
  for (const company of firmsByName.keys()) {
    if (!firmsWithRecruiter.has(company)) {
      throw new Error(`Codex recruiter-stage output has no recruiter for ${company}.`);
    }
  }
  return canonicalRecruiters;
}

function normaliseProfileUrl(value: string): string {
  const url = new URL(value);
  return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function localCodexRecoveryMessage(
  stage: "firm" | "recruiter",
  exitCode: number,
  diagnostic: string | undefined,
): string {
  const recovery = recoveryFor(diagnostic ?? "");
  return `${stage === "firm" ? "Firm" : "Recruiter"} stage failed (exit code ${exitCode}). ${recovery}`;
}

function recoveryFor(diagnostic: string): string {
  const value = diagnostic.toLocaleLowerCase();
  if (/(not signed in|not logged in|sign in|login required)/.test(value)) {
    return "Sign in to Codex, then retry this research run.";
  }
  if (/(subscription|quota|rate limit|usage limit|credit)/.test(value)) {
    return "Wait for the subscription or quota limit to reset, then retry.";
  }
  if (/(command not found|enoent|codex cli|spawn codex)/.test(value)) {
    return "Install or repair the local Codex CLI, then retry.";
  }
  return "Check the local server logs, then retry.";
}

function reportLocalCodexDiagnostic(
  stage: "firm" | "recruiter",
  exitCode: number,
  diagnostic: string | undefined,
): void {
  const bounded = diagnostic?.slice(0, 4_096);
  if (bounded) {
    process.stderr.write(
      `[recruiter-research] ${stage} stage Codex diagnostic (exit ${exitCode}): ${bounded}\n`,
    );
  }
}
