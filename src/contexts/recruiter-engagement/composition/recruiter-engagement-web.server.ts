import { randomUUID } from "node:crypto";

import { getConfiguredMarketVocabulary } from "@/contexts/discovery/composition/configured-market-vocabulary.server";
import { createResearchRunCanceller } from "@/contexts/recruiter-engagement/application/research-runs/cancel-research-run";
import { createResearchRunExecution } from "@/contexts/recruiter-engagement/application/research-runs/execute-research-run";
import { createResearchRunGetter } from "@/contexts/recruiter-engagement/application/research-runs/get-research-run";
import { createResearchRunResumer } from "@/contexts/recruiter-engagement/application/research-runs/resume-research-runs";
import { createResearchRunRetrier } from "@/contexts/recruiter-engagement/application/research-runs/retry-research-run";
import { createResearchRunStarter } from "@/contexts/recruiter-engagement/application/research-runs/start-research-run";
import { searchBriefFromSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import { createAfterResponseResearchRunScheduler } from "@/contexts/recruiter-engagement/infrastructure/background/after-response-research-run-scheduler";
import { createDeterministicStagedResearchSource } from "@/contexts/recruiter-engagement/infrastructure/deterministic/deterministic-staged-research-source";
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
import { createSqliteResearchRunStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-research-run-store";

const runs = createSqliteResearchRunStore(recruiterResearchDatabase);
bootstrapRecruiterResearch(recruiterResearchDatabase);
const settings = getRecruiterResearchSettings(recruiterResearchDatabase);
const policy = createLocalCodexAdapterPolicy(settings);
const sourcePlan = createPublicRecruiterSourcePlan(settings);
const source =
  process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE === "deterministic"
    ? createDeterministicStagedResearchSource({ pauseRecruiters: pauseDeterministicRecruiters })
    : createLocalCodexResearchSource({
        process: localCodexProcess,
        stageTimeoutMs: settings.execution.stageTimeoutMs,
      });
const execution = createResearchRunExecution({ now: () => new Date(), runs, source });
const scheduler = createAfterResponseResearchRunScheduler({
  afterResponse(callback) {
    setImmediate(() => {
      void callback();
    });
  },
  execution,
  reportFailure(message) {
    console.error(message);
  },
});
const starter = createResearchRunStarter({
  createId: randomUUID,
  now: () => new Date(),
  policy,
  runs,
  scheduler,
  sourcePlan,
});
const canceller = createResearchRunCanceller({ now: () => new Date(), runs, scheduler });
const retrier = createResearchRunRetrier({
  createId: randomUUID,
  now: () => new Date(),
  runs,
  scheduler,
});
const resumer = createResearchRunResumer({ runs, scheduler });
const getter = createResearchRunGetter({ runs });

void resumer.resumeResearchRuns();

export const recruiterEngagementWeb = {
  cancelResearchRun: canceller.cancelResearchRun,
  getResearchRun: getter.getResearchRun,
  getDefaultResearchBrief: () => {
    const options = targetLocationOptions(getConfiguredMarketVocabulary());
    return searchBriefFromSettings(
      settings,
      options.slice(0, 1).map((option) => option.label),
    );
  },
  getTargetLocationOptions: () => targetLocationOptions(getConfiguredMarketVocabulary()),
  retryResearchRun: retrier.retryResearchRun,
  startResearchRun: starter.startResearchRun,
};

function pauseDeterministicRecruiters(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 800);
  });
}
