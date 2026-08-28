import { describe, expect, it } from "vitest";

import { exitCodeFor, localCodexProcess } from "./local-codex-process";

describe("local Codex process", () => {
  it("returns bounded stderr and JSONL diagnostics when a local subprocess fails", async () => {
    const jsonLine = JSON.stringify({ type: "error", message: "not signed in to Codex" });
    const result = await localCodexProcess.run({
      command: process.execPath,
      arguments: [
        "-e",
        `const fs = require("node:fs"); fs.writeSync(1, ${JSON.stringify(`${jsonLine}\n${"x".repeat(5_000)}`)}); fs.writeSync(2, "codex failed"); process.exit(17);`,
      ],
      cwd: process.cwd(),
      environment: process.env,
    });

    expect(result.exitCode).toBe(17);
    expect(result.diagnostic ?? "").toContain(jsonLine);
    expect(result.diagnostic ?? "").toContain("codex failed");
    expect(result.diagnostic?.length ?? 0).toBeLessThanOrEqual(4_096);
  });

  it("maps a spawn error with an unusable close code to the shell command-not-found status", () => {
    expect(exitCodeFor(-1, new Error("spawn codex ENOENT"))).toBe(127);
    expect(exitCodeFor(null, new Error("spawn codex ENOENT"))).toBe(127);
  });
});
