import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  type RecruiterResearchProcess,
  type RecruiterResearchProcessRequest,
  runRecruiterResearch,
} from "./command";

const observationDate = "2026-08-27";

const validResearch = {
  observationDate,
  companies: Array.from({ length: 12 }, (_, index) => ({
    name: `Firm ${index + 1}`,
    websiteUrl: `https://firm-${index + 1}.example.com`,
    reason: "Technology hiring coverage in the UAE.",
    industries: ["Financial services", "Software"],
    specialisms: ["Software engineering", "Data and AI"],
    evidenceExcerpt:
      "This firm recruits software engineering and data talent for UAE financial services.",
    observationDate,
  })),
  recruiters: Array.from({ length: 24 }, (_, index) => {
    const firm = Math.floor(index / 2) + 1;
    return {
      name: `Recruiter ${index + 1}`,
      title: "Technology Recruiter",
      company: `Firm ${firm}`,
      linkedInUrl: `https://www.linkedin.com/in/recruiter-${index + 1}`,
      evidenceExcerpt: `Recruiter ${index + 1} recruits technology talent at Firm ${firm}.`,
      observationDate,
    };
  }),
};

describe("recruiter research command", () => {
  it("runs Codex through its controlled boundary and returns only validated final output", async () => {
    let request: RecruiterResearchProcessRequest | undefined;
    let schema: unknown;
    const process: RecruiterResearchProcess = {
      async run(nextRequest) {
        request = nextRequest;
        schema = JSON.parse(
          await readFile(valueAfter(nextRequest.arguments, "--output-schema"), "utf8"),
        );
        const outputPath = valueAfter(nextRequest.arguments, "--output-last-message");
        await writeFile(outputPath, JSON.stringify(validResearch));
        return { exitCode: 0 };
      },
    };

    const result = await runRecruiterResearch({
      brief: "Prioritise fintech and healthtech firms.",
      environment: { OPENAI_API_KEY: "must-not-reach-codex", PATH: "/usr/bin" },
      process,
      recruiterTarget: 24,
    });

    expect(result).toEqual(validResearch);
    expect(request).toMatchObject({
      command: "codex",
      cwd: expect.stringContaining("job-radar-recruiter-research-"),
      environment: { PATH: "/usr/bin" },
    });
    expect(request?.environment.OPENAI_API_KEY).toBeUndefined();
    expect(request?.arguments).toEqual(
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
    expect(request?.arguments.at(-1)).toContain("Prioritise fintech and healthtech firms.");
    expect(request?.arguments.at(-1)).toContain("technology role specialisms");
    expect(request?.arguments.at(-1)).toContain("major UAE tech-hiring sectors");
    expect(request?.arguments.at(-1)).toContain("at least 24 named technology recruiters");
    for (const discipline of [
      "software engineering",
      "data/AI",
      "cloud/DevOps",
      "cybersecurity",
      "product",
      "architecture",
      "technology leadership",
    ]) {
      expect(request?.arguments.at(-1)).toContain(discipline);
    }

    expect(schema).toMatchObject({
      properties: {
        companies: {
          minItems: 10,
          items: {
            properties: {
              industries: { type: "array", minItems: 1 },
              specialisms: { type: "array", minItems: 1 },
            },
          },
        },
        recruiters: { minItems: 24, uniqueItems: true },
      },
    });
    expect(
      (schema as { properties: { companies: { maxItems?: number } } }).properties.companies
        .maxItems,
    ).toBeUndefined();
    expect(
      (schema as { properties: { recruiters: { maxItems?: number } } }).properties.recruiters
        .maxItems,
    ).toBeUndefined();

    expect(existsSync(request?.cwd ?? "")).toBe(false);
  });

  it("fails and cleans temporary output when Codex does not provide a final result", async () => {
    let outputPath = "";
    const process: RecruiterResearchProcess = {
      async run(request) {
        outputPath = valueAfter(request.arguments, "--output-last-message");
        return { exitCode: 23 };
      },
    };

    await expect(runRecruiterResearch({ process })).rejects.toThrow("Codex exited with code 23");
    expect(existsSync(path.dirname(outputPath))).toBe(false);

    const missingOutputProcess: RecruiterResearchProcess = {
      async run() {
        return { exitCode: 0 };
      },
    };
    await expect(runRecruiterResearch({ process: missingOutputProcess })).rejects.toThrow(
      "Codex completed without final output.",
    );

    const startFailureProcess: RecruiterResearchProcess = {
      async run() {
        throw new Error("Codex process could not start.");
      },
    };
    await expect(runRecruiterResearch({ process: startFailureProcess })).rejects.toThrow(
      "Codex process could not start.",
    );
  });

  it("rejects malformed final output and market scans below the evidence threshold", async () => {
    const malformedProcess: RecruiterResearchProcess = {
      async run(request) {
        await writeFile(valueAfter(request.arguments, "--output-last-message"), "not JSON");
        return { exitCode: 0 };
      },
    };
    await expect(runRecruiterResearch({ process: malformedProcess })).rejects.toThrow(
      "final output is not valid JSON",
    );

    const incompleteProcess: RecruiterResearchProcess = {
      async run(request) {
        const incomplete = {
          ...validResearch,
          companies: validResearch.companies.slice(0, 9),
        };
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify(incomplete),
        );
        return { exitCode: 0 };
      },
    };
    await expect(runRecruiterResearch({ process: incompleteProcess })).rejects.toThrow(
      "companies must contain at least 10 entries",
    );
  });

  it("rejects duplicate named recruiters with the same public LinkedIn profile URL", async () => {
    const firstRecruiter = validResearch.recruiters[0];
    if (!firstRecruiter) {
      throw new Error("The research fixture requires a recruiter.");
    }
    const duplicateProfileProcess: RecruiterResearchProcess = {
      async run(request) {
        const duplicate = {
          ...validResearch,
          recruiters: [...validResearch.recruiters.slice(0, -1), { ...firstRecruiter }],
        };
        await writeFile(
          valueAfter(request.arguments, "--output-last-message"),
          JSON.stringify(duplicate),
        );
        return { exitCode: 0 };
      },
    };

    await expect(runRecruiterResearch({ process: duplicateProfileProcess })).rejects.toThrow(
      "recruiters must have distinct public LinkedIn profile URLs",
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
