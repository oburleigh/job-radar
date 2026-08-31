import { randomUUID } from "node:crypto";

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
import { createSaveResearchExecutionSettings } from "@/contexts/recruiter-engagement/application/research-settings/save-execution-settings";
import { rankRecruiterDirectory } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import { createAfterResponseResearchRunScheduler } from "@/contexts/recruiter-engagement/infrastructure/background/after-response-research-run-scheduler";
import { createDeterministicStagedResearchSource } from "@/contexts/recruiter-engagement/infrastructure/deterministic/deterministic-staged-research-source";
import { readLinkedInMcpReadiness } from "@/contexts/recruiter-engagement/infrastructure/linkedin-mcp/linkedin-mcp-readiness";
import {
  createLinkedInMcpResearchSource,
  linkedInMcpSourceContract,
} from "@/contexts/recruiter-engagement/infrastructure/linkedin-mcp/linkedin-mcp-research-source";
import {
  bootstrapLinkedInMcpSettings,
  getLinkedInMcpSettings,
  replaceLinkedInMcpSettings,
} from "@/contexts/recruiter-engagement/infrastructure/linkedin-mcp/linkedin-mcp-settings";
import { connectLinkedInMcpToolClient } from "@/contexts/recruiter-engagement/infrastructure/linkedin-mcp/linkedin-mcp-tool-client";
import {
  createLocalCodexAdapterPolicy,
  createPublicRecruiterSourcePlan,
} from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-policy";
import { localCodexProcess } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-process";
import { createLocalCodexResearchSource } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-research-source";
import { resolveTargetLocationOptions } from "@/contexts/recruiter-engagement/infrastructure/markets/target-location-catalogue";
import { bootstrapRecruiterResearch } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";
import { recruiterResearchDatabase } from "@/contexts/recruiter-engagement/infrastructure/sqlite/database";
import {
  getRecruiterResearchSettings,
  replaceDirectoryMatchWeights,
  replaceResearchExecutionSettings,
} from "@/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings";
import { createSqliteRecruiterDirectoryStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-recruiter-directory-store";
import { createSqliteResearchRunStore } from "@/contexts/recruiter-engagement/infrastructure/sqlite/sqlite-research-run-store";

const runs = createSqliteResearchRunStore(recruiterResearchDatabase);
const directory = createRecruiterDirectoryMaintenance({
  store: createSqliteRecruiterDirectoryStore(recruiterResearchDatabase),
});
bootstrapRecruiterResearch(recruiterResearchDatabase);
bootstrapLinkedInMcpSettings(recruiterResearchDatabase);
const initialSettings = getRecruiterResearchSettings(recruiterResearchDatabase);
const primarySource =
  process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE === "deterministic"
    ? createDeterministicStagedResearchSource({ pauseRecruiters: pauseDeterministicRecruiters })
    : createLocalCodexResearchSource({
        process: localCodexProcess,
        stageTimeoutMs: initialSettings.execution.stageTimeoutMs,
      });
const source = createResearchSourceSet({
  failures: {
    record: ({ runId, ...failure }) => runs.recordSourceFailure(runId, failure),
  },
  now: () => new Date(),
  sources:
    process.env.JOB_RADAR_RECRUITER_RESEARCH_SOURCE === "deterministic"
      ? [primarySource]
      : [
          primarySource,
          createLinkedInMcpResearchSource({
            async connect() {
              const { endpoint } = getLinkedInMcpSettings(recruiterResearchDatabase);
              if (!endpoint) throw new Error("The LinkedIn MCP adapter is not configured.");
              return connectLinkedInMcpToolClient({ endpoint });
            },
            createId: randomUUID,
          }),
        ],
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
const saveResearchExecutionSettings = createSaveResearchExecutionSettings({
  now: () => new Date(),
  settings: {
    replaceExecution: (execution, changedAt) =>
      replaceResearchExecutionSettings(recruiterResearchDatabase, execution, changedAt),
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
    };
  },
  listResearchRuns: activity.listResearchRuns,
  getDefaultSearchTargets: () => ({
    firmTarget: currentSettings().defaultBrief.firmTarget,
    recruiterTarget: currentSettings().defaultBrief.recruiterTarget,
  }),
  getDirectoryMatchWeights: () => currentSettings().directoryMatchWeights,
  getLinkedInMcpSettings: () => {
    const settings = getLinkedInMcpSettings(recruiterResearchDatabase);
    return { mcpEndpoint: settings.endpoint };
  },
  async getLinkedInMcpReadiness() {
    const { endpoint } = getLinkedInMcpSettings(recruiterResearchDatabase);
    if (!endpoint) return null;
    try {
      const client = await connectLinkedInMcpToolClient({ endpoint });
      return readLinkedInMcpReadiness(client);
    } catch {
      return {
        accountId: null,
        capabilities: { connect: false, message: false, search: false },
        message: "The configured LinkedIn MCP server is unavailable.",
        status: "unavailable" as const,
      };
    }
  },
  getResearchExecutionSettings: () => {
    const execution = currentSettings().execution;
    return { model: execution.model, reasoningEffort: execution.reasoningEffort };
  },
  resolveTargetLocations: resolveTargetLocationOptions,
  resolveDirectoryIdentity(
    command: Omit<Parameters<typeof directory.resolveIdentity>[0], "decidedAt">,
  ) {
    return directory.resolveIdentity({ ...command, decidedAt: new Date() });
  },
  retryResearchRun: retrier.retryResearchRun,
  saveResearchExecutionSettings,
  saveDirectoryMatchWeights,
  saveLinkedInMcpSettings(command: { readonly mcpEndpoint: string | null }) {
    replaceLinkedInMcpSettings(
      recruiterResearchDatabase,
      { endpoint: command.mcpEndpoint },
      new Date(),
    );
    return { status: "saved" as const };
  },
  startResearchRun(
    command: Parameters<ReturnType<typeof createResearchRunStarter>["startResearchRun"]>[0],
  ) {
    const settings = currentSettings();
    return createResearchRunStarter({
      createId: randomUUID,
      now: () => new Date(),
      policy: createLocalCodexAdapterPolicy(settings),
      runs,
      scheduler,
      sourcePlan: currentSourcePlan(settings),
    }).startResearchRun(command);
  },
};

function currentSettings() {
  return getRecruiterResearchSettings(recruiterResearchDatabase);
}

function currentSourcePlan(settings: ReturnType<typeof currentSettings>) {
  const sourcePlan = createPublicRecruiterSourcePlan(settings);
  const { endpoint } = getLinkedInMcpSettings(recruiterResearchDatabase);
  if (!endpoint) return sourcePlan;
  return {
    ...sourcePlan,
    entries: [
      ...sourcePlan.entries,
      {
        adapterId: linkedInMcpSourceContract.adapterId,
        allowedPublicSources: ["Public company profiles"],
        id: "linkedin-mcp-firms-v1",
        policyVersion: linkedInMcpSourceContract.policyVersion,
        stage: "firms" as const,
      },
      {
        adapterId: linkedInMcpSourceContract.adapterId,
        allowedPublicSources: ["Public profiles"],
        id: "linkedin-mcp-recruiters-v1",
        policyVersion: linkedInMcpSourceContract.policyVersion,
        stage: "recruiters" as const,
      },
    ],
  };
}

function pauseDeterministicRecruiters(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 800);
  });
}
