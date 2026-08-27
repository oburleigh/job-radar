import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const CODEX_MODEL = "gpt-5.6-terra";
const REASONING_EFFORT = 'model_reasoning_effort="medium"';
const COMPANY_TARGET = 10;
const LINKEDIN_PROFILE_URL = /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s]+$/i;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;
const OBSERVATION_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_RECRUITER_TARGET = 20;

export interface RecruiterResearchCompany {
  readonly name: string;
  readonly websiteUrl: string;
  readonly reason: string;
  readonly industries: readonly string[];
  readonly specialisms: readonly string[];
  readonly evidenceExcerpt: string;
  readonly observationDate: string;
}

export interface RecruiterResearchRecruiter {
  readonly name: string;
  readonly title: string;
  readonly company: string;
  readonly linkedInUrl: string;
  readonly evidenceExcerpt: string;
  readonly observationDate: string;
}

export interface RecruiterResearchResult {
  readonly observationDate: string;
  readonly companies: readonly RecruiterResearchCompany[];
  readonly recruiters: readonly RecruiterResearchRecruiter[];
}

export interface RecruiterResearchProcessRequest {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly reportProgress: (message: string) => void;
}

export interface RecruiterResearchProcess {
  run(request: RecruiterResearchProcessRequest): Promise<{ readonly exitCode: number }>;
}

export interface RunRecruiterResearchOptions {
  readonly brief?: string;
  readonly command?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly process: RecruiterResearchProcess;
  readonly reportProgress?: (message: string) => void;
  readonly recruiterTarget?: number;
}

export function recruiterResearchOutputSchema(companyTarget: number, recruiterTarget: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["observationDate", "companies", "recruiters"],
    properties: {
      observationDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      companies: {
        type: "array",
        minItems: companyTarget,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "websiteUrl",
            "reason",
            "industries",
            "specialisms",
            "evidenceExcerpt",
            "observationDate",
          ],
          properties: {
            name: { type: "string", minLength: 1 },
            websiteUrl: { type: "string", pattern: "^https://" },
            reason: { type: "string", minLength: 1 },
            industries: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            specialisms: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            evidenceExcerpt: { type: "string", minLength: 1, maxLength: 280 },
            observationDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
      },
      recruiters: {
        type: "array",
        minItems: recruiterTarget,
        uniqueItems: true,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "title",
            "company",
            "linkedInUrl",
            "evidenceExcerpt",
            "observationDate",
          ],
          properties: {
            name: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            company: { type: "string", minLength: 1 },
            linkedInUrl: { type: "string", pattern: "^https://.*linkedin\\.com/in/" },
            evidenceExcerpt: { type: "string", minLength: 1, maxLength: 280 },
            observationDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
      },
    },
  } as const;
}

export async function runRecruiterResearch(
  options: RunRecruiterResearchOptions,
): Promise<RecruiterResearchResult> {
  const recruiterTarget = requestedRecruiterTarget(options.recruiterTarget);
  const companyTarget = Math.min(COMPANY_TARGET, recruiterTarget);
  const directory = await mkdtemp(path.join(tmpdir(), "job-radar-recruiter-research-"));
  const schemaPath = path.join(directory, "output-schema.json");
  const outputPath = path.join(directory, "final-output.json");
  const reportProgress = options.reportProgress ?? (() => undefined);

  try {
    await writeFile(
      schemaPath,
      `${JSON.stringify(recruiterResearchOutputSchema(companyTarget, recruiterTarget))}\n`,
      "utf8",
    );
    const environment = { ...(options.environment ?? process.env) };
    delete environment.OPENAI_API_KEY;
    const prompt = researchPrompt(options.brief, companyTarget, recruiterTarget);
    const result = await options.process.run({
      command: options.command ?? "codex",
      arguments: [
        "--search",
        "-m",
        CODEX_MODEL,
        "-c",
        REASONING_EFFORT,
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--json",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-C",
        directory,
        prompt,
      ],
      cwd: directory,
      environment,
      reportProgress,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Codex exited with code ${result.exitCode}.`);
    }

    let output: unknown;
    try {
      output = JSON.parse(await readFile(outputPath, "utf8"));
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new Error("Codex completed without final output.");
      }
      if (error instanceof SyntaxError) {
        throw new Error("Codex final output is not valid JSON.");
      }
      throw error;
    }

    return validateRecruiterResearch(output, companyTarget, recruiterTarget);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function researchPrompt(
  brief: string | undefined,
  companyTarget: number,
  recruiterTarget: number,
): string {
  const additionalBrief = brief?.trim();
  return [
    "Run a broad public-web scan of the UAE technology recruitment market.",
    `Return at least ${companyTarget} distinct recruitment firms and at least ${recruiterTarget} named technology recruiters, with at least one recruiter for every firm, using public LinkedIn search results.`,
    "Consider both technology role specialisms and target business industries. If the brief names industries, prioritise them. Otherwise cover major UAE tech-hiring sectors.",
    "Cover these first-use-case disciplines: software engineering, data/AI, cloud/DevOps, cybersecurity, product, architecture, and technology leadership.",
    "For every company provide its name, public HTTPS company website, a concise reason, concise industries and specialisms lists, a directly attributable evidence excerpt of no more than 280 characters that supports those classifications, and the observation date.",
    "For every recruiter provide name, title, company, public HTTPS LinkedIn profile URL, directly attributable evidence excerpt of no more than 280 characters, and the observation date.",
    "Use no private, contact, or candidate data. Do not automate or access a logged-in LinkedIn session, cookies, LinkedIn DOM, messaging, browser/computer use, direct publisher crawling, or social automation.",
    "Return only JSON that conforms to the provided schema. Do not include commentary or extra fields.",
    additionalBrief ? `Additional research focus: ${additionalBrief}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function validateRecruiterResearch(
  value: unknown,
  companyTarget: number,
  recruiterTarget: number,
): RecruiterResearchResult {
  const record = requiredRecord(value, "final output");
  assertOnlyKeys(record, ["observationDate", "companies", "recruiters"], "final output");
  const observationDate = requiredString(record.observationDate, "observationDate");
  assertObservationDate(observationDate, "observationDate");
  const companies = requiredArray(record.companies, "companies");
  const recruiters = requiredArray(record.recruiters, "recruiters");

  if (companies.length < companyTarget) {
    throw new Error(`companies must contain at least ${companyTarget} entries.`);
  }
  if (recruiters.length < recruiterTarget) {
    throw new Error(`recruiters must contain at least ${recruiterTarget} entries.`);
  }

  const validatedCompanies = companies.map((company, index) =>
    validateCompany(company, `companies[${index}]`),
  );
  const companyNames = new Set(
    validatedCompanies.map((company) => company.name.toLocaleLowerCase()),
  );
  if (companyNames.size !== validatedCompanies.length) {
    throw new Error("companies must have distinct names.");
  }

  const validatedRecruiters = recruiters.map((recruiter, index) =>
    validateRecruiter(recruiter, `recruiters[${index}]`),
  );
  const recruiterProfileUrls = new Set<string>();
  for (const recruiter of validatedRecruiters) {
    const profileUrl = normalizedLinkedInProfileUrl(recruiter.linkedInUrl);
    if (recruiterProfileUrls.has(profileUrl)) {
      throw new Error("recruiters must have distinct public LinkedIn profile URLs.");
    }
    recruiterProfileUrls.add(profileUrl);
  }
  const recruiterCompanies = new Set(
    validatedRecruiters.map((recruiter) => recruiter.company.toLocaleLowerCase()),
  );
  for (const company of companyNames) {
    if (!recruiterCompanies.has(company)) {
      throw new Error(`companies must each have at least one recruiter; missing ${company}.`);
    }
  }
  for (const recruiter of validatedRecruiters) {
    if (!companyNames.has(recruiter.company.toLocaleLowerCase())) {
      throw new Error(
        `recruiter company is not one of the listed companies: ${recruiter.company}.`,
      );
    }
  }

  return {
    observationDate,
    companies: validatedCompanies,
    recruiters: validatedRecruiters,
  };
}

function validateCompany(value: unknown, label: string): RecruiterResearchCompany {
  const record = requiredRecord(value, label);
  assertOnlyKeys(
    record,
    [
      "name",
      "websiteUrl",
      "reason",
      "industries",
      "specialisms",
      "evidenceExcerpt",
      "observationDate",
    ],
    label,
  );
  const company = {
    name: requiredString(record.name, `${label}.name`),
    websiteUrl: requiredString(record.websiteUrl, `${label}.websiteUrl`),
    reason: requiredString(record.reason, `${label}.reason`),
    industries: requiredStringArray(record.industries, `${label}.industries`),
    specialisms: requiredStringArray(record.specialisms, `${label}.specialisms`),
    evidenceExcerpt: requiredString(record.evidenceExcerpt, `${label}.evidenceExcerpt`),
    observationDate: requiredString(record.observationDate, `${label}.observationDate`),
  };
  if (!HTTPS_URL.test(company.websiteUrl)) {
    throw new Error(`${label}.websiteUrl must be an HTTPS URL.`);
  }
  assertEvidenceExcerpt(company.evidenceExcerpt, `${label}.evidenceExcerpt`);
  assertObservationDate(company.observationDate, `${label}.observationDate`);
  return company;
}

function validateRecruiter(value: unknown, label: string): RecruiterResearchRecruiter {
  const record = requiredRecord(value, label);
  assertOnlyKeys(
    record,
    ["name", "title", "company", "linkedInUrl", "evidenceExcerpt", "observationDate"],
    label,
  );
  const recruiter = {
    name: requiredString(record.name, `${label}.name`),
    title: requiredString(record.title, `${label}.title`),
    company: requiredString(record.company, `${label}.company`),
    linkedInUrl: requiredString(record.linkedInUrl, `${label}.linkedInUrl`),
    evidenceExcerpt: requiredString(record.evidenceExcerpt, `${label}.evidenceExcerpt`),
    observationDate: requiredString(record.observationDate, `${label}.observationDate`),
  };
  if (!LINKEDIN_PROFILE_URL.test(recruiter.linkedInUrl)) {
    throw new Error(`${label}.linkedInUrl must be a public HTTPS LinkedIn profile URL.`);
  }
  assertEvidenceExcerpt(recruiter.evidenceExcerpt, `${label}.evidenceExcerpt`);
  assertObservationDate(recruiter.observationDate, `${label}.observationDate`);
  return recruiter;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  const values = requiredArray(value, label);
  if (values.length === 0) {
    throw new Error(`${label} must contain at least one entry.`);
  }
  return values.map((entry, index) => requiredString(entry, `${label}[${index}]`));
}

function requestedRecruiterTarget(value: number | undefined): number {
  const recruiterTarget = value ?? DEFAULT_RECRUITER_TARGET;
  if (!Number.isSafeInteger(recruiterTarget) || recruiterTarget <= 0) {
    throw new Error("recruiterTarget must be a positive integer.");
  }
  return recruiterTarget;
}

function normalizedLinkedInProfileUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "").toLocaleLowerCase();
  return `${url.protocol.toLocaleLowerCase()}//${url.hostname.toLocaleLowerCase()}${pathname}`;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }
}

function assertEvidenceExcerpt(value: string, label: string): void {
  if (value.length > 280) {
    throw new Error(`${label} must be no more than 280 characters.`);
  }
}

function assertObservationDate(value: string, label: string): void {
  if (!OBSERVATION_DATE.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
