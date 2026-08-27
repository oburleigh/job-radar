import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  type RecruiterResearchProcess,
  type RecruiterResearchProcessRequest,
  runRecruiterResearch,
} from "./command";

const observationDate = "2026-08-27";
const companies = Array.from({ length: 10 }, (_, index) => ({
  companyName: `Firm ${index + 1}`,
  websiteUrl: `https://firm-${index + 1}.example.com`,
  reason: "Technology hiring coverage in the UAE.",
  industries: ["Financial services", "Software"],
  specialisms: ["Software engineering", "Data and AI"],
  evidence: {
    adapterId: "local-codex-cli-web-search-v1",
    confidence: "high",
    excerpt: "This firm recruits software engineering and data talent for UAE financial services.",
    observedAt: observationDate,
    policyVersion: "1",
    sourceUrl: `https://firm-${index + 1}.example.com/evidence`,
  },
}));
const recruiters = Array.from({ length: 20 }, (_, index) => ({
  name: `Recruiter ${index + 1}`,
  title: "Technology Recruiter",
  companyName: `Firm ${Math.floor(index / 2) + 1}`,
  linkedInUrl: `https://www.linkedin.com/in/recruiter-${index + 1}`,
  evidence: {
    adapterId: "local-codex-cli-web-search-v1",
    confidence: "high",
    excerpt: `Recruiter ${index + 1} recruits technology talent.`,
    observedAt: observationDate,
    policyVersion: "1",
    sourceUrl: `https://www.linkedin.com/in/recruiter-${index + 1}`,
  },
}));

describe("recruiter research command", () => {
  it("is a thin CLI driver over the staged local Codex boundary", async () => {
    const requests: RecruiterResearchProcessRequest[] = [];
    const process: RecruiterResearchProcess = {
      async run(request) {
        requests.push(request);
        const schema = JSON.parse(
          await readFile(valueAfter(request.arguments, "--output-schema"), "utf8"),
        ) as { properties: Record<string, unknown> };
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify("companies" in schema.properties ? { companies } : { recruiters }),
        );
        return { exitCode: 0 };
      },
    };

    const result = await runRecruiterResearch({
      brief: "Prioritise fintech and healthtech firms.",
      environment: { OPENAI_API_KEY: "must-not-reach-codex", PATH: "/usr/bin" },
      process,
    });

    expect(result.companies).toHaveLength(10);
    expect(result.recruiters).toHaveLength(20);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.environment.OPENAI_API_KEY === undefined)).toBe(
      true,
    );
    expect(requests.every((request) => existsSync(request.cwd) === false)).toBe(true);
    expect(requests[1]?.arguments.at(-1)).toContain("Firm 1");
  });

  it("returns failure from a missing or unsuccessful final stage", async () => {
    const failedProcess: RecruiterResearchProcess = {
      async run() {
        return { exitCode: 23 };
      },
    };
    await expect(runRecruiterResearch({ process: failedProcess })).rejects.toThrow(
      "Firm stage failed (exit code 23). Check the local server logs, then retry.",
    );

    const missingOutputProcess: RecruiterResearchProcess = {
      async run() {
        return { exitCode: 0 };
      },
    };
    await expect(runRecruiterResearch({ process: missingOutputProcess })).rejects.toThrow(
      "Codex completed without final output.",
    );
  });
});

function valueAfter(argumentsList: readonly string[], flag: string): string {
  const index = argumentsList.indexOf(flag);
  const value = argumentsList[index + 1];
  if (index < 0 || !value) {
    throw new Error(`Missing ${flag} argument.`);
  }
  return value;
}
