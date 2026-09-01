import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stderrLimit = 1_048_576;

export type CodexExecution = {
  readonly model: string;
  readonly reasoningEffort: string;
  readonly stageTimeoutMs: number;
};

export type CodexRequest = {
  readonly execution: CodexExecution;
  readonly instructions: string;
  readonly outputSchema: unknown;
  readonly signal?: AbortSignal | undefined;
};

export interface CodexClient {
  readonly complete: (request: CodexRequest) => Promise<string>;
}

export class CodexFailure extends Error {
  readonly code: string;

  constructor(input: {
    readonly cause?: unknown;
    readonly code: string;
    readonly message: string;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "CodexFailure";
    this.code = input.code;
  }
}

export function createCodexCliClient(options: {
  readonly binaryPath: string;
  readonly scratchDirectory: string;
}): CodexClient {
  return {
    async complete({ execution, instructions, outputSchema, signal }) {
      const directory = mkdtempSync(join(options.scratchDirectory, "codex-run-"));
      const schemaPath = join(directory, "schema.json");
      const replyPath = join(directory, "reply.json");
      try {
        writeFileSync(schemaPath, JSON.stringify(outputSchema));
        await runCodex({
          arguments: [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "-s",
            "read-only",
            "-C",
            directory,
            "-m",
            execution.model,
            "-c",
            "tools.web_search=true",
            "-c",
            `model_reasoning_effort=${execution.reasoningEffort}`,
            "--output-schema",
            schemaPath,
            "-o",
            replyPath,
            instructions,
          ],
          binaryPath: options.binaryPath,
          signal,
          timeoutMs: execution.stageTimeoutMs,
        });
        return readReply(replyPath);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
  };
}

function readReply(replyPath: string): string {
  try {
    return readFileSync(replyPath, "utf8");
  } catch (error) {
    throw new CodexFailure({
      cause: error,
      code: "codex-reply-missing",
      message: "Codex finished without writing a research reply.",
    });
  }
}

function runCodex(request: {
  readonly arguments: readonly string[];
  readonly binaryPath: string;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.binaryPath, [...request.arguments], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < stderrLimit) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(
        new CodexFailure({
          cause: error,
          code: "codex-invocation-failed",
          message: error.message,
        }),
      );
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CodexFailure({
          code: "codex-invocation-failed",
          message: stderr.trim() || `Codex exited with ${code ?? signal}.`,
        }),
      );
    });
  });
}
