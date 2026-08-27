import { spawn } from "node:child_process";

import type { LocalCodexProcess, LocalCodexProcessRequest } from "./local-codex-research-source";

export const localCodexProcess: LocalCodexProcess = {
  run(request: LocalCodexProcessRequest) {
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.arguments, {
        cwd: request.cwd,
        env: request.environment,
        signal: request.signal,
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ exitCode: code ?? 1 }));
    });
  },
};
