import { randomUUID } from "node:crypto";
import {
  createConfiguredWebSearchClient,
  getConfiguredWebSearchProviderOptions,
} from "@/contexts/discovery/public-web-search.server";
import { createRecruiterDirectoryMaintenance } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import { createResearchRunCanceller } from "@/contexts/recruiter-engagement/application/research-runs/cancel-research-run";
import { createResearchRunExecution } from "@/contexts/recruiter-engagement/application/research-runs/execute-research-run";
import { createResearchRunGetter } from "@/contexts/recruiter-engagement/application/research-runs/get-research-run";
import { createResearchRunActivityReader } from "@/contexts/recruiter-engagement/application/research-runs/list-research-runs";
import { createResearchSourceSet } from "@/contexts/recruiter-engagement/application/research-runs/research-source-set";
import { createResearchRunResumer } from "@/contexts/recruiter-engagement/application/research-runs/resume-research-runs";
import { createResearchRunRetrier } from "@/contexts/recruiter-engagement/application/research-runs/retry-research-run";
import { createResearchRunStarter } from "@/contexts/recruiter-engagement/application/research-runs/start-research-run";
import { createSaveDirectoryMatchWeights } from "@/contexts/recruiter-engagement/application/research-settings/save-directory-match-weights";
import { createSavePublicSearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/save-public-search-settings";
import { createSaveResearchCriteriaOptions } from "@/contexts/recruiter-engagement/application/research-settings/save-research-criteria-options";
import { createShortlistManagement } from "@/contexts/recruiter-engagement/application/shortlists/manage-shortlists";
import { rankRecruiterDirectory } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import { createAfterResponseResearchRunScheduler } from "@/contexts/recruiter-engagement/infrastructure/background/after-response-research-run-scheduler";
import { createDeterministicStagedResearchSource } from "@/contexts/recruiter-engagement/infrastructure/deterministic/deterministic-staged-research-source";
import { resolveTargetLocationOptions } from "@/contexts/recruiter-engagement/infrastructure/markets/target-location-catalogue";
import {
  createPublicWebAdapterPolicy,
  createPublicWebSourcePlan,
  publicWebAdapterId,
} from "@/contexts/recruiter-engagement/infrastructure/public-web/public-web-policy";
import { createPublicWebResearchSource } from "@/contexts/recruiter-engagement/infrastructure/public-web/public-web-research-source";
import { bootstrapRecruiterResearch } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";
import { recruiterResearchDatabase } from "@/contexts/recruiter-engagement/infrastructure/sqlite/database";
import {
  getRecruiterResearchSettings,
  replaceDirectoryMatchWeights,
  replacePublicSearchSettings,
  replaceResearchCriteriaOptions,
} from "@/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings";
import { createSqliteRecruiterDirectoryStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-recruiter-directory-store";
import { createSqliteResearchRunStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-research-run-store";
import { createSqliteShortlistStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-shortlist-store";

const runs = createSqliteResearchRunStore(recruiterResearchDatabase);
const directoryStore = createSqliteRecruiterDirectoryStore(recruiterResearchDatabase);
const directory = createRecruiterDirectoryMaintenance({
  store: directoryStore,
});
const shortlists = createShortlistManagement({
  createId: randomUUID,
  directory: directoryStore,
  now: () => new Date(),
  shortlists: createSqliteShortlistStore(recruiterResearchDatabase),
});
bootstrapRecruiterResearch(recruiterResearchDatabase);
const sourceFailures = {
  record: ({
    runId,
    ...failure
  }: Parameters<typeof runs.recordSourceFailure>[1] & { runId: string }) =>
    runs.recordSourceFailure(runId, failure),
};
const publicSources = getConfiguredWebSearchProviderOptions().map((provider) =>
  createPublicWebResearchSource({
    client: {
      search: (request) => createConfiguredWebSearchClient(provider.name).search(request),
    },
    failures: sourceFailures,
    now: () => new Date(),
    providerName: provider.name,
  }),
);
const source = createResearchSourceSet({
  failures: sourceFailures,
  now: () => new Date(),
  sources:
    process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE === "deterministic"
      ? [createDeterministicStagedResearchSource({ pauseRecruiters: pauseDeterministicRecruiters })]
      : publicSources,
});
const execution = createResearchRunExecution({ directory, now: () => new Date(), runs, source });
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
const savePublicSearchSettings = createSavePublicSearchSettings({
  now: () => new Date(),
  settings: {
    replacePublicSearch: (publicSearch, changedAt) =>
      replacePublicSearchSettings(recruiterResearchDatabase, publicSearch, changedAt),
  },
});
const saveResearchCriteriaOptions = createSaveResearchCriteriaOptions({
  now: () => new Date(),
  settings: {
    replaceResearchCriteriaOptions: (options, changedAt) =>
      replaceResearchCriteriaOptions(recruiterResearchDatabase, options, changedAt),
  },
});
const saveDirectoryMatchWeights = createSaveDirectoryMatchWeights({
  now: () => new Date(),
  settings: {
    replaceDirectoryMatchWeights: (weights, changedAt) =>
      replaceDirectoryMatchWeights(recruiterResearchDatabase, weights, changedAt),
  },
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
const activity = createResearchRunActivityReader({ runs });

void resumer.resumeResearchRuns();

export const recruiterEngagementWeb = {
  cancelResearchRun: canceller.cancelResearchRun,
  correctDirectoryFact(command: Omit<Parameters<typeof directory.correctFact>[0], "correctedAt">) {
    return directory.correctFact({ ...command, correctedAt: new Date() });
  },
  async getResearchRun(runId: string) {
    const research = await getter.getResearchRun(runId);
    if (!research) {
      return undefined;
    }
    return {
      ...research,
      directory: rankRecruiterDirectory(await directory.getDirectory(), {
        asOf: new Date(),
        brief: research.run.brief,
        weights: currentSettings().directoryMatchWeights,
      }),
      shortlists: await shortlists.list(),
    };
  },
  listResearchRuns: activity.listResearchRuns,
  getResearchCriteriaOptions: () => currentSettings().criteriaOptions,
  getDefaultSearchTargets: () => ({
    firmTarget: currentSettings().defaultBrief.firmTarget,
    recruiterTarget: currentSettings().defaultBrief.recruiterTarget,
  }),
  getDirectoryMatchWeights: () => currentSettings().directoryMatchWeights,
  getPublicSearchSettings: () => currentSettings().publicSearch,
  getPublicSearchProviderOptions: getConfiguredWebSearchProviderOptions,
  getProviderNameForRun(run: Pick<ResearchRun, "policy">) {
    return (
      getConfiguredWebSearchProviderOptions().find(
        (provider) => publicWebAdapterId(provider.name) === run.policy.id,
      )?.name ?? currentSettings().publicSearch.providerName
    );
  },
  resolveTargetLocations: resolveTargetLocationOptions,
  resolveDirectoryIdentity(
    command: Omit<Parameters<typeof directory.resolveIdentity>[0], "decidedAt">,
  ) {
    return directory.resolveIdentity({ ...command, decidedAt: new Date() });
  },
  retryResearchRun: retrier.retryResearchRun,
  savePublicSearchSettings,
  saveResearchCriteriaOptions,
  saveDirectoryMatchWeights,
  shortlists,
  startResearchRun(
    command: Parameters<ReturnType<typeof createResearchRunStarter>["startResearchRun"]>[0] & {
      readonly providerName: string;
    },
  ) {
    const { providerName, ...startCommand } = command;
    const provider = getConfiguredWebSearchProviderOptions().find(
      (option) => option.name === providerName && option.configured,
    );
    if (!provider) throw new Error("Choose a configured search provider.");
    const current = currentSettings();
    const settings = {
      ...current,
      publicSearch: { ...current.publicSearch, providerName },
    };
    return createResearchRunStarter({
      createId: randomUUID,
      now: () => new Date(),
      policy: createPublicWebAdapterPolicy(settings),
      runs,
      scheduler,
      sourcePlan: createPublicWebSourcePlan(settings),
    }).startResearchRun(startCommand);
  },
};

function currentSettings() {
  return getRecruiterResearchSettings(recruiterResearchDatabase);
}

function pauseDeterministicRecruiters(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 800);
  });
}
