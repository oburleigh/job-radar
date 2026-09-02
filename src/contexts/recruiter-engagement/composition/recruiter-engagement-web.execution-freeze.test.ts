import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ResearchExecutionSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";

/**
 * The defect this covers lived in the wiring, not in any unit: the Codex Source was handed
 * `() => currentSettings().execution` and read it per stage. Only a test that drives the real
 * composition through a real child process can fail if that wiring returns.
 */

const handshake = mkdtempSync(path.join(tmpdir(), "codex-freeze-"));
const invocationLog = path.join(handshake, "invocations.jsonl");
const firmsStarted = path.join(handshake, "firms-started");
const release = path.join(handshake, "continue");
const stubBinary = path.join(handshake, "codex-stub.mjs");

/** Longer than the deadlines below, so a stall reports which wait failed rather than a bare timeout. */
const testTimeoutMs = 60_000;
const waitDeadlineMs = 20_000;

const frozen = { model: "frozen-model", reasoningEffort: "low", stageTimeoutMs: 60_000 } as const;
const changed = {
  model: "changed-mid-run",
  reasoningEffort: "xhigh",
  stageTimeoutMs: 90_000,
} as const;

const stubSource = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const valueAfter = (flag) => argv[argv.indexOf(flag) + 1];
const configured = (key) =>
  argv.find((value) => value.startsWith(key + "="))?.slice(key.length + 1);

const log = ${JSON.stringify(invocationLog)};
const previous = existsSync(log) ? readFileSync(log, "utf8").trim().split("\\n").length : 0;
appendFileSync(
  log,
  JSON.stringify({
    model: valueAfter("-m"),
    reasoningEffort: configured("model_reasoning_effort"),
  }) + "\\n",
);

if (previous === 0) {
  writeFileSync(${JSON.stringify(firmsStarted)}, "");
  const deadline = Date.now() + ${waitDeadlineMs};
  while (!existsSync(${JSON.stringify(release)}) && Date.now() < deadline) {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(shared, 0, 0, 10);
  }
}

const firms = {
  firms: [
    {
      companyName: "Stub Firm",
      confidence: "high",
      excerpt: "We place software engineering roles across the United Kingdom.",
      hasCurrentMandatesOrActivity: true,
      hasNamedRecruiterOrTeamEvidence: true,
      hasScaleOrTrackRecord: true,
      industries: ["Technology"],
      reason: "Places software engineering roles.",
      sourceUrl: "https://stub-firm.example/about",
      specialisms: ["Software engineering"],
      targetMarkets: ["United Kingdom"],
      websiteUrl: "https://stub-firm.example",
    },
  ],
};
const recruiters = {
  recruiters: [
    {
      companyName: "Stub Firm",
      confidence: "medium",
      excerpt: "Leads technology hiring at Stub Firm.",
      name: "Stub Recruiter",
      profileUrl: "https://profiles.example.com/in/stub-recruiter",
      sourceUrl: "https://stub-firm.example/team",
      title: "Principal Consultant",
    },
  ],
};

writeFileSync(valueAfter("-o"), JSON.stringify(previous === 0 ? firms : recruiters));
`;

async function until(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + waitDeadlineMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

function invocations(): readonly { model: string; reasoningEffort: string }[] {
  if (!existsSync(invocationLog)) return [];
  return readFileSync(invocationLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

type Composition = typeof import("./recruiter-engagement-web.server");

const priorEnvironment = {
  binary: process.env.JOB_RADAR_CODEX_BINARY,
  source: process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE,
};
let web: Composition["recruiterEngagementWeb"];
let priorExecution: ResearchExecutionSettings;

beforeAll(async () => {
  writeFileSync(stubBinary, stubSource);
  chmodSync(stubBinary, 0o755);
  process.env.JOB_RADAR_CODEX_BINARY = stubBinary;
  process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE = "codex";
  ({ recruiterEngagementWeb: web } = await import("./recruiter-engagement-web.server"));
  priorExecution = web.getExecutionSettings();
});

afterAll(() => {
  web?.saveExecutionSettings(priorExecution);
  restore("JOB_RADAR_CODEX_BINARY", priorEnvironment.binary);
  restore("JOB_RADAR_RECRUITER_RESEARCH_SOURCE", priorEnvironment.source);
  rmSync(handshake, { force: true, recursive: true });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("recruiter engagement composition", () => {
  it(
    "keeps a run on the execution settings it started with when Settings change mid-run",
    async () => {
      web.saveExecutionSettings({ ...frozen, stageRequestLimit: 2 });

      const started = await web.startResearchRun({
        brief: "United Kingdom software engineering recruitment firms",
        criteria: {
          industries: ["Technology"],
          specialisms: ["Software engineering"],
          targetLocations: ["United Kingdom"],
        },
        firmTarget: 1,
        recruiterTarget: 1,
      });

      try {
        await until(() => existsSync(firmsStarted), "the firms stage to reach the Codex binary");
        web.saveExecutionSettings({ ...changed, stageRequestLimit: 2 });
        expect(web.getExecutionSettings().model).toBe(changed.model);
      } finally {
        writeFileSync(release, "");
      }

      await until(async () => {
        const research = await web.getResearchRun(started.runId);
        return research !== undefined && research.run.finishedAt !== null;
      }, "the run to finish");

      const research = await web.getResearchRun(started.runId);
      expect(research?.run.status).toBe("completed");
      expect(invocations()).toEqual([
        { model: frozen.model, reasoningEffort: frozen.reasoningEffort },
        { model: frozen.model, reasoningEffort: frozen.reasoningEffort },
      ]);
      expect(research?.run.sourcePlan.execution).toEqual(frozen);
    },
    testTimeoutMs,
  );
});
