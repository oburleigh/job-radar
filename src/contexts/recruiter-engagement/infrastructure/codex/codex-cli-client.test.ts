import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexFailure, createCodexCliClient } from "./codex-cli-client";

const stubBinary = fileURLToPath(new URL("../../test-support/stub-codex-cli.mjs", import.meta.url));

const request = {
  execution: { model: "test-model", reasoningEffort: "high", stageTimeoutMs: 10_000 },
  instructions: "Find firms.",
  outputSchema: { type: "object" },
};

describe("codex cli client", () => {
  let scratchDirectory: string;

  beforeEach(() => {
    scratchDirectory = mkdtempSync(join(tmpdir(), "codex-client-"));
    process.env.STUB_CODEX_ARGS_FILE = join(scratchDirectory, "args.json");
  });

  afterEach(() => {
    rmSync(scratchDirectory, { force: true, recursive: true });
    delete process.env.STUB_CODEX_ARGS_FILE;
    delete process.env.STUB_CODEX_BEHAVIOUR;
    delete process.env.STUB_CODEX_REPLY;
  });

  function client() {
    return createCodexCliClient({ binaryPath: stubBinary, scratchDirectory });
  }

  function recordedArguments(): string[] {
    return JSON.parse(readFileSync(join(scratchDirectory, "args.json"), "utf8"));
  }

  function recordedValueOf(flag: string): string {
    const args = recordedArguments();
    const value = args[args.indexOf(flag) + 1];
    if (value === undefined) throw new Error(`Codex was not given ${flag}.`);
    return value;
  }

  it("returns the final agent message", async () => {
    process.env.STUB_CODEX_REPLY = '{"firms":[]}';
    await expect(client().complete(request)).resolves.toBe('{"firms":[]}');
  });

  it("runs the non-interactive subcommand with live search and its own configuration", async () => {
    await client().complete(request);
    const args = recordedArguments();
    expect(args[0]).toBe("exec");
    expect(args).toContain("tools.web_search=true");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--skip-git-repo-check");
    expect(args.slice(args.indexOf("-s"), args.indexOf("-s") + 2)).toEqual(["-s", "read-only"]);
  });

  it("passes the configured model and reasoning effort to the binary", async () => {
    const args = await client()
      .complete(request)
      .then(() => recordedArguments());
    expect(args.slice(args.indexOf("-m"), args.indexOf("-m") + 2)).toEqual(["-m", "test-model"]);
    expect(args).toContain("model_reasoning_effort=high");
  });

  it("sends the instructions as the prompt argument", async () => {
    await client().complete(request);
    expect(recordedArguments().at(-1)).toBe("Find firms.");
  });

  it("writes the supplied schema to the file the binary is told to read", async () => {
    await client().complete({ ...request, outputSchema: { title: "firms", type: "object" } });
    expect(recordedValueOf("--output-schema")).toContain(scratchDirectory);
  });

  it("removes its working directory once the call resolves", async () => {
    await client().complete(request);
    const schemaPath = recordedValueOf("--output-schema");
    expect(() => readFileSync(schemaPath, "utf8")).toThrow();
  });

  it("reports a non-zero exit as a Codex failure carrying the binary's message", async () => {
    process.env.STUB_CODEX_BEHAVIOUR = "fail";
    await expect(client().complete(request)).rejects.toThrow(CodexFailure);
    await expect(client().complete(request)).rejects.toThrow(/stub codex refused the request/);
  });

  it("reports a run that exits cleanly without writing a reply", async () => {
    process.env.STUB_CODEX_BEHAVIOUR = "silent";
    await expect(client().complete(request)).rejects.toThrow(CodexFailure);
  });

  it("abandons a run that exceeds the stage timeout", async () => {
    process.env.STUB_CODEX_BEHAVIOUR = "hang";
    const slow = { ...request, execution: { ...request.execution, stageTimeoutMs: 250 } };
    await expect(client().complete(slow)).rejects.toThrow(CodexFailure);
  });

  it("abandons a run when the caller aborts", async () => {
    process.env.STUB_CODEX_BEHAVIOUR = "hang";
    const controller = new AbortController();
    const pending = client().complete({ ...request, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow(CodexFailure);
  });
});
