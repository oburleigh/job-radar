import path from "node:path";
import { fileURLToPath } from "node:url";

import { localCodexProcess } from "@/contexts/recruiter-engagement/infrastructure/local-codex/local-codex-process";
import { DEFAULT_RECRUITER_TARGET, runRecruiterResearch } from "./command";

export async function runCli(argumentsList: readonly string[]): Promise<void> {
  const argumentsInput = parseRecruiterResearchArguments(argumentsList);
  const result = await runRecruiterResearch({
    brief: argumentsInput.brief,
    process: localCodexProcess,
    recruiterTarget: argumentsInput.recruiterTarget,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export interface RecruiterResearchCliArguments {
  readonly brief: string;
  readonly recruiterTarget: number;
}

export function parseRecruiterResearchArguments(
  argumentsList: readonly string[],
): RecruiterResearchCliArguments {
  const brief: string[] = [];
  let recruiterTarget = DEFAULT_RECRUITER_TARGET;
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
