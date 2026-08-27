import { spawn } from "node:child_process";

import type { LocalCodexProcess, LocalCodexProcessRequest } from "./local-codex-research-source";

const MAX_DIAGNOSTIC_CHARS_PER_STREAM = 2_048;

export const localCodexProcess: LocalCodexProcess = {
  run(request: LocalCodexProcessRequest) {
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.arguments, {
        cwd: request.cwd,
        env: request.environment,
        signal: request.signal,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      let stdout = "";
      let spawnError: Error | undefined;
      let settled = false;
      const rejectOnce = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendDiagnostic(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendDiagnostic(stderr, chunk);
      });
      child.on("error", (error) => {
        if (request.signal?.aborted) {
          rejectOnce(error);
          return;
        }
        spawnError = error;
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        setImmediate(() => {
          resolve({
            exitCode: exitCodeFor(code, spawnError),
            diagnostic: [stdout, stderr, spawnError?.message].filter(Boolean).join("\n"),
          });
        });
      });
    });
  },
};

export function exitCodeFor(code: number | null, spawnError: Error | undefined): number {
  if (spawnError && (code === null || code < 0)) {
    return 127;
  }
  return code ?? (spawnError ? 127 : 1);
}

function appendDiagnostic(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(0, MAX_DIAGNOSTIC_CHARS_PER_STREAM);
}
