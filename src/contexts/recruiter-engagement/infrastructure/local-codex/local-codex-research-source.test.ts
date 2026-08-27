import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createResearchRunExecution } from "@/contexts/recruiter-engagement/application/research-runs/execute-research-run";

import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createFakeResearchRunStore } from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import {
  createLocalCodexResearchSource,
  type LocalCodexProcess,
} from "./local-codex-research-source";

describe("local Codex research source", () => {
  it("uses separate final-output stages and removes the API key before starting Codex", async () => {
    const requests: {
      readonly arguments: readonly string[];
      readonly cwd: string;
      readonly environment: NodeJS.ProcessEnv;
    }[] = [];
    const process: LocalCodexProcess = {
      async run(request) {
        requests.push(request);
        const schema = JSON.parse(
          await readFile(valueAfter(request.arguments, "--output-schema"), "utf8"),
        ) as { properties: Record<string, unknown> };
        const outputPath = valueAfter(request.arguments, "--output-last-message");
        if ("companies" in schema.properties) {
          await writeFile(
            outputPath,
            JSON.stringify({
              companies: [
                {
                  companyName: "Firm One",
                  websiteUrl: "https://firm-one.example",
                  evidence: {
                    adapterId: "local-codex-cli-web-search-v1",
                    confidence: "high",
                    excerpt: "Firm One recruits technology teams.",
                    observedAt: "2026-08-27",
                    policyVersion: "1",
                    sourceUrl: "https://firm-one.example/evidence",
                  },
                  reason: "Technology recruitment",
                  industries: ["Financial services"],
                  specialisms: ["Software engineering"],
                },
              ],
            }),
          );
        } else {
          await writeFile(
            outputPath,
            JSON.stringify({
              recruiters: [
                {
                  name: "Amina Khan",
                  title: "Technology Recruiter",
                  companyName: "Firm One",
                  linkedInUrl: "https://www.linkedin.com/in/amina-khan",
                  evidence: {
                    adapterId: "local-codex-cli-web-search-v1",
                    confidence: "high",
                    excerpt: "Technology Recruiter at Firm One.",
                    observedAt: "2026-08-27",
                    policyVersion: "1",
                    sourceUrl: "https://www.linkedin.com/in/amina-khan",
                  },
                },
              ],
            }),
          );
        }
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({
      environment: {
        NODE_OPTIONS: "--import=dotenv/config",
        OPENAI_API_KEY: "must-not-reach-codex",
        PATH: "/usr/bin",
      },
      process,
    });
    const run = createResearchRun({
      id: "run-1",
      brief: createSearchBrief({ description: "UAE financial technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    const firms = await source.findFirms({ run });
    const recruiters = await source.findRecruiters({ run, firms });

    expect(firms).toHaveLength(1);
    expect(recruiters).toHaveLength(1);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.environment.OPENAI_API_KEY).toBeUndefined();
      expect(request.environment.NODE_OPTIONS).toBeUndefined();
      expect(request.environment.PATH).toBe("/usr/bin");
      expect(request.arguments).toEqual(
        expect.arrayContaining([
          "--search",
          "-m",
          "gpt-5.6-terra",
          'model_reasoning_effort="medium"',
          "exec",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--output-schema",
          "--output-last-message",
        ]),
      );
      expect(existsSync(request.cwd)).toBe(false);
    }
    expect(requests[0]?.arguments.at(-1)).toContain("run-1:firms");
    expect(requests[1]?.arguments.at(-1)).toContain("run-1:recruiters");
    expect(requests[1]?.arguments.at(-1)).toContain("Firm One");
  });

  it("canonicalises recruiter company names to the frozen firm spelling", async () => {
    const process: LocalCodexProcess = {
      async run(request) {
        const schema = JSON.parse(
          await readFile(valueAfter(request.arguments, "--output-schema"), "utf8"),
        ) as { properties: Record<string, unknown> };
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify(
            "companies" in schema.properties
              ? { companies: [sampleFirm("Michael Page")] }
              : {
                  recruiters: [
                    sampleRecruiter(
                      "Amina Khan",
                      "MICHAEL PAGE",
                      "https://www.linkedin.com/in/amina-khan",
                    ),
                  ],
                },
          ),
        );
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({ process });
    const run = sampleRun(1);

    const firms = await source.findFirms({ run });

    await expect(source.findRecruiters({ run, firms })).resolves.toMatchObject([
      { companyName: "Michael Page" },
    ]);
  });

  it("rejects recruiter evidence that names a different LinkedIn profile", async () => {
    const process: LocalCodexProcess = {
      async run(request) {
        const schema = JSON.parse(
          await readFile(valueAfter(request.arguments, "--output-schema"), "utf8"),
        ) as { properties: Record<string, unknown> };
        const mismatchedRecruiter = sampleRecruiter(
          "Amina Khan",
          "Firm One",
          "https://www.linkedin.com/in/amina-khan",
        );
        mismatchedRecruiter.evidence.sourceUrl = "https://www.linkedin.com/in/other-recruiter";
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify(
            "companies" in schema.properties
              ? { companies: [sampleFirm("Firm One")] }
              : { recruiters: [mismatchedRecruiter] },
          ),
        );
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({ process });
    const run = sampleRun(1);
    const firms = await source.findFirms({ run });

    await expect(source.findRecruiters({ run, firms })).rejects.toThrow(
      "Codex recruiter-stage evidence must identify the displayed public LinkedIn profile.",
    );
  });

  it("bounds a local Codex stage and reports a recoverable timeout", async () => {
    const process: LocalCodexProcess = {
      async run(request) {
        return new Promise((_, reject) => {
          const rejectForAbort = () => reject(request.signal?.reason);
          if (request.signal?.aborted) {
            rejectForAbort();
            return;
          }
          request.signal?.addEventListener("abort", rejectForAbort, { once: true });
        });
      },
    };
    const source = createLocalCodexResearchSource({ process, stageTimeoutMs: 1 });

    await expect(source.findFirms({ run: sampleRun(1) })).rejects.toThrow(
      "Local Codex firm stage timed out after 1ms.",
    );
  });

  it("rejects a successful Codex exit that has no final output and removes its temporary directory", async () => {
    let cwd = "";
    const process: LocalCodexProcess = {
      async run(request) {
        cwd = request.cwd;
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({ process });
    const run = sampleRun(1);

    await expect(source.findFirms({ run })).rejects.toThrow(
      "Codex completed without final output.",
    );
    expect(existsSync(cwd)).toBe(false);
  });

  it("rejects final observations without schema-validated evidence", async () => {
    const process: LocalCodexProcess = {
      async run(request) {
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify({
            companies: [
              {
                companyName: "Firm One",
                websiteUrl: "https://firm-one.example",
                reason: "Technology recruitment",
                industries: ["Financial services"],
                specialisms: ["Software engineering"],
              },
            ],
          }),
        );
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({ process });

    await expect(source.findFirms({ run: sampleRun(1) })).rejects.toThrow(
      "Codex firm-stage output is invalid",
    );
  });

  it("rejects duplicate normalized public LinkedIn profile URLs from the final recruiter output", async () => {
    const process: LocalCodexProcess = {
      async run(request) {
        const outputPath = valueAfter(request.arguments, "--output-last-message");
        const schema = JSON.parse(
          await readFile(valueAfter(request.arguments, "--output-schema"), "utf8"),
        ) as { properties: Record<string, unknown> };
        const output =
          "companies" in schema.properties
            ? {
                companies: [sampleFirm("Firm One"), sampleFirm("Firm Two")],
              }
            : {
                recruiters: [
                  sampleRecruiter(
                    "Amina Khan",
                    "Firm One",
                    "https://www.linkedin.com/in/amina-khan",
                  ),
                  sampleRecruiter(
                    "Amina Khan Duplicate",
                    "Firm Two",
                    "https://www.linkedin.com/in/amina-khan/",
                  ),
                ],
              };
        await writeFile(outputPath, JSON.stringify(output));
        return { exitCode: 0 };
      },
    };
    const source = createLocalCodexResearchSource({ process });
    const run = sampleRun(2);
    const firms = await source.findFirms({ run });

    await expect(source.findRecruiters({ run, firms })).rejects.toThrow(
      "Codex recruiter-stage output must use distinct public LinkedIn profile URLs.",
    );
  });

  it("rejects disabled, mismatched, and out-of-plan runs before starting a Codex process", async () => {
    const variants = [
      {
        policy: { ...testAdapterPolicy, enabled: false },
        sourcePlan: testSourcePlan,
      },
      {
        policy: { ...testAdapterPolicy, id: "other-adapter-v1" },
        sourcePlan: testSourcePlan,
      },
      {
        policy: {
          ...testAdapterPolicy,
          execution: { ...testAdapterPolicy.execution, reasoningEffort: "high" },
        },
        sourcePlan: testSourcePlan,
      },
      {
        policy: { ...testAdapterPolicy, permittedOperations: [] },
        sourcePlan: testSourcePlan,
      },
      {
        policy: testAdapterPolicy,
        sourcePlan: { ...testSourcePlan, entries: [] },
      },
      {
        policy: testAdapterPolicy,
        sourcePlan: {
          ...testSourcePlan,
          entries: testSourcePlan.entries.map((entry, index) => ({
            ...entry,
            ...(index === 0 ? { policyVersion: "not-frozen" } : {}),
          })),
        },
      },
    ];

    for (const [index, variant] of variants.entries()) {
      const process = { run: vi.fn() } satisfies LocalCodexProcess;
      const source = createLocalCodexResearchSource({ process });
      const run = createResearchRun({
        id: `run-refusal-${index}`,
        brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
        policy: variant.policy,
        sourcePlan: variant.sourcePlan,
        startedAt: new Date("2026-08-27T10:00:00.000Z"),
      });
      const runs = createFakeResearchRunStore([run]);
      const execution = createResearchRunExecution({
        now: () => new Date("2026-08-27T10:01:00.000Z"),
        runs,
        source,
      });

      await execution.executeResearchRun(run.id);

      expect(process.run).not.toHaveBeenCalled();
      expect((await runs.get(run.id))?.status).toBe("failed");
      expect(await runs.failuresFor(run.id)).toHaveLength(1);
    }
  });
});

function sampleRun(recruiterTarget: number) {
  return createResearchRun({
    id: "run-sample",
    brief: createSearchBrief({ description: "UAE financial technology", recruiterTarget }),
    policy: testAdapterPolicy,
    sourcePlan: testSourcePlan,
    startedAt: new Date("2026-08-27T10:00:00.000Z"),
  });
}

function sampleFirm(companyName: string) {
  return {
    companyName,
    websiteUrl: `https://${companyName.toLowerCase().replaceAll(" ", "-")}.example`,
    evidence: {
      adapterId: "local-codex-cli-web-search-v1",
      confidence: "high",
      excerpt: `${companyName} recruits technology teams.`,
      observedAt: "2026-08-27",
      policyVersion: "1",
      sourceUrl: `https://${companyName.toLowerCase().replaceAll(" ", "-")}.example/evidence`,
    },
    reason: "Technology recruitment",
    industries: ["Financial services"],
    specialisms: ["Software engineering"],
  };
}

function sampleRecruiter(name: string, companyName: string, linkedInUrl: string) {
  return {
    name,
    title: "Technology Recruiter",
    companyName,
    linkedInUrl,
    evidence: {
      adapterId: "local-codex-cli-web-search-v1",
      confidence: "high",
      excerpt: `${name} is a technology recruiter.`,
      observedAt: "2026-08-27",
      policyVersion: "1",
      sourceUrl: linkedInUrl,
    },
  };
}

function valueAfter(argumentsList: readonly string[], flag: string): string {
  const index = argumentsList.indexOf(flag);
  const value = argumentsList[index + 1];
  if (index < 0 || !value) {
    throw new Error(`Missing ${flag} argument.`);
  }
  return value;
}
