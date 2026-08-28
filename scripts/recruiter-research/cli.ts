import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredMarketVocabulary } from "@/contexts/discovery/composition/configured-market-vocabulary.server";
import { localCodexProcess } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-process";
import { targetLocationOptions } from "@/contexts/recruiter-engagement/infrastructure/markets/target-location-catalogue";
import { recruiterResearchDatabase } from "@/contexts/recruiter-engagement/infrastructure/sqlite/database";
import { getRecruiterResearchSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings";
import { runRecruiterResearch } from "./command";

export async function runCli(argumentsList: readonly string[]): Promise<void> {
  const settings = getRecruiterResearchSettings(recruiterResearchDatabase);
  const argumentsInput = parseRecruiterResearchArguments(
    argumentsList,
    settings.defaultBrief.recruiterTarget,
  );
  const result = await runRecruiterResearch({
    brief: argumentsInput.brief,
    process: localCodexProcess,
    recruiterTarget: argumentsInput.recruiterTarget,
    settings,
    targetLocations: targetLocationOptions(getConfiguredMarketVocabulary())
      .slice(0, 1)
      .map((option) => option.label),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export interface RecruiterResearchCliArguments {
  readonly brief: string;
  readonly recruiterTarget: number;
}

export function parseRecruiterResearchArguments(
  argumentsList: readonly string[],
  defaultRecruiterTarget: number,
): RecruiterResearchCliArguments {
  const brief: string[] = [];
  let recruiterTarget = defaultRecruiterTarget;
  let recruiterTargetSpecified = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] ?? "";
    if (argument !== "--recruiters") {
      brief.push(argument);
      continue;
    }
    if (recruiterTargetSpecified) {
      throw new Error("--recruiters may be supplied once.");
    }
    const value = argumentsList[index + 1];
    if (!value || !/^[1-9]\d*$/.test(value)) {
      throw new Error("--recruiters requires a positive integer.");
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error("--recruiters requires a positive integer.");
    }
    recruiterTarget = parsed;
    recruiterTargetSpecified = true;
    index += 1;
  }

  return { brief: brief.join(" ").trim(), recruiterTarget };
}

const entryPoint = process.argv[1];
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Recruiter research failed: ${message}\n`);
    process.exitCode = 1;
  });
}
