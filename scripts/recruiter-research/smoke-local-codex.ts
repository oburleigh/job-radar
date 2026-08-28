import { randomUUID } from "node:crypto";

import { getConfiguredMarketVocabulary } from "@/contexts/discovery/composition/configured-market-vocabulary.server";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  createLocalCodexAdapterPolicy,
  createPublicRecruiterSourcePlan,
} from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-policy";
import { localCodexProcess } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-process";
import { createLocalCodexResearchSource } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-research-source";
import { targetLocationOptions } from "@/contexts/recruiter-engagement/infrastructure/markets/target-location-catalogue";
import { bootstrapRecruiterResearch } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";
import { recruiterResearchDatabase } from "@/contexts/recruiter-engagement/infrastructure/sqlite/database";
import { getRecruiterResearchSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings";

async function main(): Promise<void> {
  bootstrapRecruiterResearch(recruiterResearchDatabase);
  const settings = getRecruiterResearchSettings(recruiterResearchDatabase);
  const targetLocation = targetLocationOptions(getConfiguredMarketVocabulary())[0]?.label;
  if (!targetLocation) {
    throw new Error("Recruiter research smoke requires one configured target location.");
  }
  const run = createResearchRun({
    id: `smoke-${randomUUID()}`,
    brief: createSearchBrief({
      criteria: { ...settings.defaultBrief.criteria, targetLocations: [targetLocation] },
      description: "Find one relevant public recruitment firm to verify the local Codex contract.",
      firmTarget: 1,
      recruiterTarget: 1,
    }),
    policy: createLocalCodexAdapterPolicy(settings),
    sourcePlan: createPublicRecruiterSourcePlan(settings),
    startedAt: new Date(),
  });
  const source = createLocalCodexResearchSource({
    process: localCodexProcess,
    stageTimeoutMs: settings.execution.stageTimeoutMs,
  });

  const firms = await source.findFirms({ run });
  const recruiters = await source.findRecruiters({ run, firms });

  process.stdout.write(
    `Local Codex recruiter smoke passed with ${firms.length} firm and ${recruiters.length} recruiter result.\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
