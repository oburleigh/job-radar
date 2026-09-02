import { tmpdir } from "node:os";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import { createCodexCliClient } from "@/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client";
import {
  createCodexAdapterPolicy,
  createCodexSourcePlan,
} from "@/contexts/recruiter-engagement/infrastructure/codex/codex-policy";
import { createCodexResearchSource } from "@/contexts/recruiter-engagement/infrastructure/codex/codex-research-source";
import { defaultRecruiterResearchSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";

const settings = defaultRecruiterResearchSettings;
const firmTarget = 2;

const run = createResearchRun({
  brief: createSearchBrief({
    criteria: {
      industries: ["Technology"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Kingdom"],
    },
    description: "",
    firmTarget,
    recruiterTarget: firmTarget * 2,
  }),
  id: "smoke-codex-research",
  policy: createCodexAdapterPolicy(settings),
  sourcePlan: createCodexSourcePlan(settings),
  startedAt: new Date(),
});

const source = createCodexResearchSource({
  client: createCodexCliClient({
    binaryPath: process.env.JOB_RADAR_CODEX_BINARY || "codex",
    scratchDirectory: tmpdir(),
  }),
  execution: () => settings.execution,
  now: () => new Date(),
});

const failures: string[] = [];
let reservations = 0;
const startedAt = Date.now();

const firms = await source.findFirms({
  reserveRequest: async () => {
    reservations += 1;
    return reservations <= 1;
  },
  run,
});

const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
console.log(
  `Codex returned ${firms.length} firms in ${elapsedSeconds}s for a target of ${firmTarget}.`,
);
for (const firm of firms) {
  console.log(`- ${firm.companyName} ${firm.websiteUrl}`);
  console.log(`  evidence ${firm.evidence.confidence} ${firm.evidence.sourceUrl}`);
  console.log(`  "${firm.evidence.excerpt}"`);
}

if (reservations !== 1) {
  failures.push(`Expected the firms stage to reserve one request, not ${reservations}.`);
}
if (firms.length === 0) {
  failures.push("Expected the firms stage to return at least one firm, got none.");
}
if (firms.length > firmTarget) {
  failures.push(`Expected at most ${firmTarget} firms, got ${firms.length}.`);
}
for (const firm of firms) {
  if (!firm.websiteUrl.startsWith("https://")) {
    failures.push(`${firm.companyName} has a website that is not https: ${firm.websiteUrl}`);
  }
  if (!firm.evidence.sourceUrl.startsWith("https://")) {
    failures.push(`${firm.companyName} has no https citation: ${firm.evidence.sourceUrl}`);
  }
  if (firm.evidence.excerpt.trim() === "") {
    failures.push(`${firm.companyName} has an empty evidence excerpt.`);
  }
  if (firm.evidence.adapterId !== run.policy.id) {
    failures.push(`${firm.companyName} records the wrong adapter: ${firm.evidence.adapterId}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("Codex research boundary smoke check passed.");
