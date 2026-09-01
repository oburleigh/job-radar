# Codex Recruiter Research Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Recruiter Search run return the number of qualified recruitment firms the brief asked for, in the region the brief named, by having the locally installed Codex CLI perform the research instead of paging a public web search provider.

**Architecture:** A new driven adapter implements the existing `ResearchSource` port by invoking `codex exec` as a subprocess with live web search and a JSON Schema constrained final response. The frozen run supplies every value in the prompt; the adapter maps the validated reply into `FirmObservation` and `RecruiterObservation`. Provider search adapters stay in the codebase and remain selectable, but leave the default critical path. One stage becomes one or two subprocess invocations instead of up to 50 provider requests, which removes the request allowance exhaustion that made runs fail.

**Tech Stack:** TypeScript, `node:child_process.spawn`, Zod 4 (`z.toJSONSchema`), Vitest, SQLite via Drizzle, codex-cli 0.151.0 authenticated by ChatGPT plan login.

**Spec:** This plan is the design record. The defects it closes are ADM-302 (targets do not bound what a run returns), ADM-304 (unqualified firms are ranked but never filtered) and ADM-305 (request allowance cannot cover the work a run generates). ADM-303 (a run shows the whole directory, not that run's region) is deliberately out of scope and lands in the following batch, together with the separate accumulated-directory browsing surface.

## Global Constraints

- Package manager is `pnpm`. Never create an npm lockfile.
- Never run bare `pnpm build`; it overwrites the `build/` a running user server serves. Use `pnpm build:verification`.
- The user's SQLite database under `data/` is private user data. Migrations must work against an empty database and must not depend on existing profiles, sources, or run history.
- The dev server on `:5173` is the user's. Read-only. Any checking of your own uses port 3199 and a disposable database.
- No environment-specific, deployment-specific or operator-changeable value may be hard-coded. Model, reasoning effort, stage timeout, stage request allowance and target counts come from SQLite-backed settings. Seed data is the one source of initial product defaults.
- Provider prompts must be derived from the frozen run and its policy. A prompt template may not embed a market, industry, specialism, target count, model or reasoning effort as a literal.
- `src/contexts/recruiter-engagement/CONTEXT.md` is the naming authority. Use Research run, Search brief, Research criteria, Specialism, Observation, Evidence, Qualified recruitment firm, Source plan, Adapter policy, Research budget, Source failure.
- Domain code imports no Zod, no Node APIs, no infrastructure. Application code owns ports. Only `composition` selects concrete adapters.
- Comments are rare and concise. Never narrate the code.
- Seeded model default is `gpt-5.6-sol`; seeded reasoning effort default is `high`.

---

## Verified facts this plan depends on

Established by running the commands, not assumed. Do not re-derive.

- `codex --version` is `codex-cli 0.151.0` at `/home/ubuntu/.nvm/versions/node/v24.15.0/bin/codex`.
- `codex login status` reports `Logged in using ChatGPT`. There is no API key and no per-token billing.
- `codex exec --output-schema <file> -o <file>` returns a schema-conformant JSON object. Verified reply: `{"qualified":true,"reason":"smoke test"}`, exit code 0.
- **`codex exec` blocks reading stdin when stdin is a pipe.** The first attempt hung for three minutes and printed `Reading additional input from stdin...`. Every invocation from the application must attach stdin to `/dev/null`.
- One invocation carries roughly 22,000 input tokens of Codex harness context before the prompt. Plan-metered rather than billed, but it is why a stage is one invocation rather than one per firm.
- `codex exec` loads `~/.codex/config.toml` and the user's MCP servers by default; the smoke run emitted `failed to refresh OAuth tokens for server atlassian`. The application must pass `--ignore-user-config` so application settings decide model and effort. Per `codex exec --help`, auth still resolves through `CODEX_HOME` when user config is ignored.
- `codex --help` documents `--search`: "Enable live web search. When enabled, the native Responses `web_search` tool is available".
- All four `model_reasoning_effort` values are accepted by this binary. Task 1 ran `low`, `medium`, `high` and `xhigh` against `-m gpt-5.6-sol` with `--ignore-user-config`; every one exited 0 and returned `{"ok":true}`. The same run confirms `--ignore-user-config` still authenticates through `CODEX_HOME`.

## File Structure

**Create**

- `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.ts` — the subprocess boundary. Builds the argument vector, runs `codex exec`, enforces timeout and abort, returns the raw final message text. Knows nothing about recruitment.
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts`
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.ts` — Zod schemas for the firm and recruiter replies, and the JSON Schema derived from them.
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts`
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.ts` — builds stage instructions from a frozen `ResearchRun`.
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts`
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.ts` — implements `ResearchSource`.
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.test.ts`
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-policy.ts` — `codexAdapterId`, `createCodexAdapterPolicy`, `createCodexSourcePlan`.
- `src/contexts/recruiter-engagement/infrastructure/codex/codex-policy.test.ts`
- `src/contexts/recruiter-engagement/application/research-settings/save-execution-settings.ts`
- `src/contexts/recruiter-engagement/application/research-settings/save-execution-settings.test.ts`
- `src/contexts/recruiter-engagement/presentation/web/requests/execution-settings-request.ts`
- `src/contexts/recruiter-engagement/test-support/stub-codex-cli.mjs` — a real executable that mimics `codex exec` for the transport test.
- `scripts/smoke-codex-research.ts` — the real-boundary smoke check.

**Modify**

- `src/contexts/recruiter-engagement/application/research-settings/settings.ts` — reinstate `execution`.
- `src/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research.ts:8-100` — seed `execution`; `:285-293` — stop deleting `execution`, add it when absent, restore technology-qualified `firmDiscoveryPhrases`.
- `src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.ts` — validate and replace `execution`.
- `src/contexts/recruiter-engagement/composition/recruiter-engagement-web.server.ts:60-77` — select the Codex source by default.
- `package.json` — add `test:smoke:codex`.

`pnpm verify` is **not** modified by this plan. Wiring the smoke check into the gate is a gate change and needs the user's decision.

---

### Task 1: Confirm the reasoning effort vocabulary — DONE

**Files:** none. This task produces evidence, not code.

**Interfaces:**
- Produces: the confirmed set of `model_reasoning_effort` values, consumed by Task 5's Zod enum.

- [ ] **Step 1: Run each candidate value once**

```bash
SP=/tmp/claude-1000/codex-effort-check
mkdir -p "$SP"
printf '{"type":"object","additionalProperties":false,"required":["ok"],"properties":{"ok":{"type":"boolean"}}}' > "$SP/ok.schema.json"
for effort in low medium high xhigh; do
  codex exec --skip-git-repo-check --ephemeral --ignore-user-config -s read-only \
    -m gpt-5.6-sol -c "model_reasoning_effort=$effort" \
    --output-schema "$SP/ok.schema.json" -o "$SP/$effort.json" \
    "Reply using the schema with ok true." < /dev/null > "$SP/$effort.log" 2>&1
  echo "$effort exit=$? $(cat "$SP/$effort.json" 2>/dev/null)"
done
```

Expected: each accepted value exits 0 and writes `{"ok":true}`. A rejected value exits non-zero and names the invalid setting in its log.

- [ ] **Step 2: Record the result in the plan**

Edit this file's "Verified facts" section to state which values this binary accepts. Task 5's enum uses exactly that set. If a value is rejected, it must not appear in the enum, and `gpt-5.6-sol` / `high` remains the seeded default regardless.

- [ ] **Step 3: Delete the scratch directory**

```bash
rm -rf /tmp/claude-1000/codex-effort-check
```

---

### Task 2: Codex CLI transport — DONE (2d41a84)

**Delivered with `spawn`, not `execFile`.** `execFile` has no `stdio` option, so it leaves the child's stdin an open pipe and reproduces the recorded hang. The committed code and tests are authoritative over the code blocks below.

**Files:**
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts`
- Create: `src/contexts/recruiter-engagement/test-support/stub-codex-cli.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type CodexExecution = { readonly model: string; readonly reasoningEffort: string; readonly stageTimeoutMs: number }`
  - `type CodexRequest = { readonly execution: CodexExecution; readonly instructions: string; readonly outputSchema: unknown; readonly signal?: AbortSignal | undefined }`
  - `interface CodexClient { readonly complete: (request: CodexRequest) => Promise<string> }`
  - `class CodexFailure extends Error { readonly code: string }`
  - `function createCodexCliClient(options: { readonly binaryPath: string; readonly scratchDirectory: string }): CodexClient`

`complete` resolves with the raw text of the final agent message and never parses it. Parsing belongs to Task 3.

- [ ] **Step 1: Write the stub executable the test drives**

Create `src/contexts/recruiter-engagement/test-support/stub-codex-cli.mjs`:

```javascript
#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

if (process.env.STUB_CODEX_BEHAVIOUR === "hang") {
  setTimeout(() => {}, 60_000);
} else if (process.env.STUB_CODEX_BEHAVIOUR === "fail") {
  process.stderr.write("stub codex refused the request\n");
  process.exit(3);
} else {
  writeFileSync(valueOf("-o"), process.env.STUB_CODEX_REPLY ?? "{}");
  writeFileSync(
    new URL("../../../../../stub-codex-args.json", import.meta.url),
    JSON.stringify(args),
  );
  process.exit(0);
}
```

Note the args file path is rewritten in Step 3 to a directory the test owns; the placeholder above is replaced there.

- [ ] **Step 2: Write the failing test**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts`:

```typescript
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexFailure, createCodexCliClient } from "./codex-cli-client";

const stubBinary = fileURLToPath(
  new URL("../../test-support/stub-codex-cli.mjs", import.meta.url),
);

describe("codex cli client", () => {
  let scratchDirectory: string;

  beforeEach(() => {
    scratchDirectory = mkdtempSync(join(tmpdir(), "codex-client-"));
  });

  afterEach(() => {
    rmSync(scratchDirectory, { force: true, recursive: true });
    delete process.env.STUB_CODEX_BEHAVIOUR;
    delete process.env.STUB_CODEX_REPLY;
  });

  function client() {
    return createCodexCliClient({ binaryPath: stubBinary, scratchDirectory });
  }

  const request = {
    execution: { model: "test-model", reasoningEffort: "high", stageTimeoutMs: 5_000 },
    instructions: "Find firms.",
    outputSchema: { type: "object" },
  };

  it("returns the final agent message", async () => {
    process.env.STUB_CODEX_REPLY = '{"firms":[]}';
    await expect(client().complete(request)).resolves.toBe('{"firms":[]}');
  });

  it("passes the configured model and reasoning effort to the binary", async () => {
    process.env.STUB_CODEX_REPLY = "{}";
    await client().complete(request);
    const args: string[] = JSON.parse(
      readFileSync(join(scratchDirectory, "stub-codex-args.json"), "utf8"),
    );
    expect(args).toContain("exec");
    expect(args).toContain("--search");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--ephemeral");
    expect(args.slice(args.indexOf("-m"), args.indexOf("-m") + 2)).toEqual(["-m", "test-model"]);
    expect(args).toContain("model_reasoning_effort=high");
    expect(args.slice(args.indexOf("-s"), args.indexOf("-s") + 2)).toEqual(["-s", "read-only"]);
  });

  it("reports a non-zero exit as a Codex failure carrying the binary's message", async () => {
    process.env.STUB_CODEX_BEHAVIOUR = "fail";
    await expect(client().complete(request)).rejects.toThrow(CodexFailure);
    await expect(client().complete(request)).rejects.toThrow(/stub codex refused the request/);
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
```

- [ ] **Step 3: Point the stub's args file at the scratch directory**

The stub must write `stub-codex-args.json` beside the `-o` file so the test can read it. Replace the `writeFileSync(new URL(...))` line in `stub-codex-cli.mjs` with:

```javascript
  writeFileSync(join(dirname(valueOf("-o")), "stub-codex-args.json"), JSON.stringify(args));
```

and add `import { dirname, join } from "node:path";` to its imports.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts`
Expected: FAIL, `Failed to resolve import "./codex-cli-client"`.

- [ ] **Step 5: Implement the transport**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.ts`:

```typescript
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

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

  constructor(input: { readonly cause?: unknown; readonly code: string; readonly message: string }) {
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
      const directory = mkdtempSync(join(options.scratchDirectory, "run-"));
      const schemaPath = join(directory, "schema.json");
      const replyPath = join(directory, "reply.json");
      writeFileSync(schemaPath, JSON.stringify(outputSchema));
      try {
        await run(
          options.binaryPath,
          [
            "exec",
            "--search",
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
            `model_reasoning_effort=${execution.reasoningEffort}`,
            "--output-schema",
            schemaPath,
            "-o",
            replyPath,
            instructions,
          ],
          {
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
            timeout: execution.stageTimeoutMs,
            ...(signal ? { signal } : {}),
          },
        );
        return readFileSync(replyPath, "utf8");
      } catch (error) {
        throw new CodexFailure({
          cause: error,
          code: "codex-invocation-failed",
          message: failureMessage(error),
        });
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
  };
}

function failureMessage(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String((error as { stderr: unknown }).stderr).trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}
```

`stdio: ["ignore", ...]` is what stops the three-minute stdin hang recorded in the verified facts. Do not remove it.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.ts \
        src/contexts/recruiter-engagement/infrastructure/codex/codex-cli-client.test.ts \
        src/contexts/recruiter-engagement/test-support/stub-codex-cli.mjs
git commit -m "feat(search): add a Codex CLI transport for research runs"
```

---

### Task 3: Research reply schemas — DONE (b5b4295)

**Files:**
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const codexFirmReplySchema` and `const codexRecruiterReplySchema` (Zod object schemas)
  - `const codexFirmJsonSchema` and `const codexRecruiterJsonSchema` (plain JSON Schema objects for `--output-schema`)
  - `type CodexFirmReply = z.infer<typeof codexFirmReplySchema>`
  - `type CodexRecruiterReply = z.infer<typeof codexRecruiterReplySchema>`

Every firm carries the fields `FirmObservation` needs, including a citation, so a fabricated firm is detectable rather than plausible.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  codexFirmJsonSchema,
  codexFirmReplySchema,
  codexRecruiterReplySchema,
} from "./codex-research-schema";

const firm = {
  companyName: "Example Technology Recruitment",
  websiteUrl: "https://example-tech-recruitment.com",
  reason: "Places software engineering roles across the United Arab Emirates.",
  industries: ["Technology"],
  specialisms: ["Software engineering"],
  targetMarkets: ["United Arab Emirates"],
  hasCurrentMandatesOrActivity: true,
  hasNamedRecruiterOrTeamEvidence: true,
  hasScaleOrTrackRecord: false,
  confidence: "high",
  sourceUrl: "https://example-tech-recruitment.com/about",
  excerpt: "We recruit software engineers for clients across the UAE.",
};

describe("codex research schema", () => {
  it("accepts a complete firm reply", () => {
    expect(codexFirmReplySchema.parse({ firms: [firm] }).firms).toHaveLength(1);
  });

  it("rejects a firm whose website is not an absolute https url", () => {
    expect(() =>
      codexFirmReplySchema.parse({ firms: [{ ...firm, websiteUrl: "example.com" }] }),
    ).toThrow();
  });

  it("rejects a firm with no citation, which is how a fabricated firm presents", () => {
    const { sourceUrl: _omitted, ...withoutCitation } = firm;
    expect(() => codexFirmReplySchema.parse({ firms: [withoutCitation] })).toThrow();
  });

  it("rejects an unknown confidence level", () => {
    expect(() =>
      codexFirmReplySchema.parse({ firms: [{ ...firm, confidence: "certain" }] }),
    ).toThrow();
  });

  it("rejects a recruiter reply whose profile url is missing", () => {
    expect(() =>
      codexRecruiterReplySchema.parse({
        recruiters: [
          {
            name: "Alex Morgan",
            title: "Principal Consultant",
            companyName: "Example Technology Recruitment",
            confidence: "medium",
            sourceUrl: "https://example-tech-recruitment.com/team",
            excerpt: "Alex Morgan, Principal Consultant.",
          },
        ],
      }),
    ).toThrow();
  });

  it("publishes a json schema the codex binary can consume", () => {
    expect(codexFirmJsonSchema).toMatchObject({ type: "object" });
    expect(JSON.stringify(codexFirmJsonSchema)).toContain("websiteUrl");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts`
Expected: FAIL, `Failed to resolve import "./codex-research-schema"`.

- [ ] **Step 3: Implement the schemas**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.ts`:

```typescript
import { z } from "zod";

const httpsUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Expected an absolute https URL.");

const confidence = z.enum(["high", "medium", "low"]);

const codexFirmSchema = z.object({
  companyName: z.string().min(1),
  confidence,
  excerpt: z.string().min(1),
  hasCurrentMandatesOrActivity: z.boolean(),
  hasNamedRecruiterOrTeamEvidence: z.boolean(),
  hasScaleOrTrackRecord: z.boolean(),
  industries: z.array(z.string().min(1)),
  reason: z.string().min(1),
  sourceUrl: httpsUrl,
  specialisms: z.array(z.string().min(1)),
  targetMarkets: z.array(z.string().min(1)),
  websiteUrl: httpsUrl,
});

const codexRecruiterSchema = z.object({
  companyName: z.string().min(1),
  confidence,
  excerpt: z.string().min(1),
  name: z.string().min(1),
  profileUrl: httpsUrl,
  sourceUrl: httpsUrl,
  title: z.string().min(1),
});

export { codexFirmSchema, codexRecruiterSchema };

export const codexFirmReplySchema = z.object({ firms: z.array(codexFirmSchema) });
export const codexRecruiterReplySchema = z.object({ recruiters: z.array(codexRecruiterSchema) });

export type CodexFirm = z.infer<typeof codexFirmSchema>;
export type CodexRecruiter = z.infer<typeof codexRecruiterSchema>;
export type CodexFirmReply = z.infer<typeof codexFirmReplySchema>;
export type CodexRecruiterReply = z.infer<typeof codexRecruiterReplySchema>;

export const codexFirmJsonSchema = z.toJSONSchema(codexFirmReplySchema);
export const codexRecruiterJsonSchema = z.toJSONSchema(codexRecruiterReplySchema);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts`
Expected: PASS, 6 tests.

If `z.toJSONSchema` emits a `$ref`-bearing document the binary rejects at Task 8's smoke check, pass `{ io: "output" }` and inline definitions rather than hand-writing a second schema.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.ts \
        src/contexts/recruiter-engagement/infrastructure/codex/codex-research-schema.test.ts
git commit -m "feat(search): describe the Codex research reply contract"
```

---

### Task 4: Stage instructions built from the frozen run — DONE (adb3415)

**Files:**
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts`

**Interfaces:**
- Consumes: `ResearchRun` and `FirmObservation` from the domain.
- Produces:
  - `function firmDiscoveryInstructions(run: ResearchRun): string`
  - `function recruiterDiscoveryInstructions(run: ResearchRun, firms: readonly FirmObservation[]): string`

Every market, specialism, industry and count is interpolated from `run.brief`. The template holds no such literal, which is what the configuration rule in `AGENTS.md` requires.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { researchRunFixture } from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { firmDiscoveryInstructions, recruiterDiscoveryInstructions } from "./codex-research-prompt";

const run = researchRunFixture({
  brief: {
    criteria: {
      industries: ["Technology"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    description: "Senior backend roles.",
    firmTarget: 20,
    recruiterTarget: 40,
  },
});

describe("codex research prompt", () => {
  it("asks for exactly the run's firm target", () => {
    expect(firmDiscoveryInstructions(run)).toContain("20");
  });

  it("names the run's target locations", () => {
    expect(firmDiscoveryInstructions(run)).toContain("United Arab Emirates");
  });

  it("names the run's specialisms and industries", () => {
    const instructions = firmDiscoveryInstructions(run);
    expect(instructions).toContain("Software engineering");
    expect(instructions).toContain("Technology");
  });

  it("carries the user's own description", () => {
    expect(firmDiscoveryInstructions(run)).toContain("Senior backend roles.");
  });

  it("requires a citation for every firm", () => {
    expect(firmDiscoveryInstructions(run)).toMatch(/sourceUrl/);
  });

  it("hard-codes no market, specialism or count of its own", () => {
    const bare = researchRunFixture({
      brief: {
        criteria: { industries: [], specialisms: [], targetLocations: [] },
        description: "",
        firmTarget: 1,
        recruiterTarget: 1,
      },
    });
    const instructions = firmDiscoveryInstructions(bare);
    expect(instructions).not.toMatch(/technology|recruitment agency|United Kingdom/i);
  });

  it("lists only the qualified firms handed to the recruiter stage", () => {
    const firm = { companyName: "Example Search", websiteUrl: "https://example-search.com" };
    const instructions = recruiterDiscoveryInstructions(run, [firm as FirmObservation]);
    expect(instructions).toContain("https://example-search.com");
    expect(instructions).toContain("40");
  });
});
```

`researchRunFixture` may not yet exist in `research-run-fakes.ts` with an overridable brief. Read `src/contexts/recruiter-engagement/test-support/research-run-fakes.ts` first and extend it rather than adding a second fixture factory.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts`
Expected: FAIL, `Failed to resolve import "./codex-research-prompt"`.

- [ ] **Step 3: Implement the prompt builders**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.ts`:

```typescript
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";

export function firmDiscoveryInstructions(run: ResearchRun): string {
  const { criteria, description, firmTarget } = run.brief;
  return [
    `Research the ${firmTarget} best recruitment firms that match the brief below.`,
    "",
    section("Target locations", criteria.targetLocations),
    section("Specialisms", criteria.specialisms),
    section("Target industries", criteria.industries),
    description ? `Brief: ${description}` : "",
    "",
    "Rules:",
    `- Return at most ${firmTarget} firms. Fewer is correct when fewer genuinely match.`,
    "- A firm qualifies only when its own public website shows it recruits for the",
    "  stated specialisms and operates in the stated target locations.",
    "- Read each firm's own site before including it. Do not rely on directory,",
    "  aggregator or listicle pages.",
    "- Every firm needs a sourceUrl citing the page that evidences the claim, and an",
    "  excerpt quoted from that page.",
    "- Exclude a firm you cannot evidence. An omission is correct; a guess is not.",
    "",
    "Return the result using the supplied JSON schema and nothing else.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function recruiterDiscoveryInstructions(
  run: ResearchRun,
  firms: readonly FirmObservation[],
): string {
  const { criteria, recruiterTarget } = run.brief;
  return [
    `Find up to ${recruiterTarget} named recruiters who work at the firms listed below.`,
    "",
    section("Firms", firms.map((firm) => `${firm.companyName} (${firm.websiteUrl})`)),
    section("Specialisms", criteria.specialisms),
    section("Target locations", criteria.targetLocations),
    "",
    "Rules:",
    `- Return at most ${recruiterTarget} recruiters across all firms.`,
    "- Include a recruiter only when a public page names them in a recruiting role at",
    "  one of the listed firms.",
    "- profileUrl is the recruiter's own public professional profile.",
    "- Every recruiter needs a sourceUrl and an excerpt quoted from that page.",
    "- Do not collect personal contact details.",
    "",
    "Return the result using the supplied JSON schema and nothing else.",
  ].join("\n");
}

function section(label: string, values: readonly string[]): string {
  return values.length === 0 ? "" : `${label}: ${values.join(", ")}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.ts \
        src/contexts/recruiter-engagement/infrastructure/codex/codex-research-prompt.test.ts \
        src/contexts/recruiter-engagement/test-support/research-run-fakes.ts
git commit -m "feat(search): derive Codex stage instructions from the frozen run"
```

---

### Task 5: Execution settings — DONE (28a11bc)

**Files:**
- Modify: `src/contexts/recruiter-engagement/application/research-settings/settings.ts`
- Modify: `src/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research.ts`
- Modify: `src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.ts`
- Create: `src/contexts/recruiter-engagement/application/research-settings/save-execution-settings.ts`
- Create: `src/contexts/recruiter-engagement/application/research-settings/save-execution-settings.test.ts`
- Test: `src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.test.ts`

**Interfaces:**
- Consumes: the confirmed effort vocabulary from Task 1.
- Produces:
  - `RecruiterResearchSettings.execution: { readonly model: string; readonly reasoningEffort: ResearchReasoningEffort; readonly stageRequestLimit: number; readonly stageTimeoutMs: number }`
  - `type ResearchReasoningEffort = "low" | "medium" | "high" | "xhigh"` — narrowed to Task 1's confirmed set.
  - `function createSaveExecutionSettings(dependencies): { readonly saveExecutionSettings: (command) => Promise<void> }`

`stageRequestLimit` here counts Codex invocations for a stage, not provider requests. The seeded value is 2, which allows one invocation and one retry. This is what closes ADM-305: the allowance and the work a run generates are now the same unit.

- [ ] **Step 1: Write the failing settings test**

Add to `src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.test.ts`:

```typescript
it("seeds Codex execution settings for a new workspace", () => {
  const database = createTestDatabase();
  bootstrapRecruiterResearch(database);
  expect(getRecruiterResearchSettings(database).execution).toEqual({
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    stageRequestLimit: 2,
    stageTimeoutMs: 600_000,
  });
});

it("restores execution settings a previous migration removed", () => {
  const database = createTestDatabase();
  bootstrapRecruiterResearch(database);
  replaceExecutionSettings(
    database,
    { model: "gpt-5.6-sol", reasoningEffort: "low", stageRequestLimit: 2, stageTimeoutMs: 1_000 },
    new Date(),
  );
  expect(getRecruiterResearchSettings(database).execution.reasoningEffort).toBe("low");
});

it("rejects a reasoning effort the Codex binary does not accept", () => {
  const database = createTestDatabase();
  bootstrapRecruiterResearch(database);
  expect(() =>
    replaceExecutionSettings(
      database,
      {
        model: "gpt-5.6-sol",
        reasoningEffort: "extreme" as never,
        stageRequestLimit: 2,
        stageTimeoutMs: 1_000,
      },
      new Date(),
    ),
  ).toThrow();
});

it("restores technology-qualified firm discovery phrases for a new workspace", () => {
  const database = createTestDatabase();
  bootstrapRecruiterResearch(database);
  expect(getRecruiterResearchSettings(database).publicSearch.firmDiscoveryPhrases).toContain(
    "technology recruitment agency",
  );
});
```

Read the file first; reuse its existing `createTestDatabase` helper rather than adding another.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.test.ts`
Expected: FAIL, `execution` is undefined and `replaceExecutionSettings` is not exported.

- [ ] **Step 3: Add the type**

In `src/contexts/recruiter-engagement/application/research-settings/settings.ts`, add above `RecruiterResearchSettings`:

```typescript
export type ResearchReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ResearchExecutionSettings = {
  readonly model: string;
  readonly reasoningEffort: ResearchReasoningEffort;
  readonly stageRequestLimit: number;
  readonly stageTimeoutMs: number;
};
```

and add `readonly execution: ResearchExecutionSettings;` to `RecruiterResearchSettings`.

- [ ] **Step 4: Seed and migrate**

In `bootstrap-recruiter-research.ts`, add to `defaultRecruiterResearchSettings`:

```typescript
  execution: {
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    stageRequestLimit: 2,
    stageTimeoutMs: 600_000,
  },
```

Restore the technology-qualified phrases in `defaultRecruiterResearchSettings.publicSearch.firmDiscoveryPhrases`:

```typescript
    firmDiscoveryPhrases: [
      "technology recruitment agency",
      "technology recruitment firm",
      "IT recruitment agency",
      "technology executive search",
    ],
```

Replace the block at `:285-289` that rewrites legacy technology phrases with generic ones — that migration now runs backwards and must go. Replace the block at `:291-293`:

```typescript
  if ("execution" in migrated) {
    delete migrated.execution;
    changed = true;
  }
```

with:

```typescript
  if (!("execution" in migrated)) {
    migrated.execution = defaultRecruiterResearchSettings.execution;
    changed = true;
  }
```

The legacy-shape lists earlier in the file still name the old `execution` records; leave them, because they identify untouched legacy defaults that get replaced wholesale.

- [ ] **Step 5: Validate and expose the setting**

In `recruiter-research-settings.ts`, extend the Zod settings schema with the execution object, its `reasoningEffort` enum matching Task 1's confirmed set, `stageRequestLimit` as `z.number().int().min(1)` and `stageTimeoutMs` as `z.number().int().min(1000)`, and export `replaceExecutionSettings` following the shape of the existing `replacePublicSearchSettings`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/sqlite/recruiter-research-settings.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the application use case**

Create `save-execution-settings.ts` mirroring `save-public-search-settings.ts` exactly, with its own test asserting that the command reaches the settings port with the supplied `changedAt`.

- [ ] **Step 8: Run the affected suite**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement`
Expected: PASS. Existing settings tests that assert the absence of `execution` will fail; update them to the new contract rather than weakening the assertion.

- [ ] **Step 9: Commit**

```bash
git add src/contexts/recruiter-engagement/application/research-settings \
        src/contexts/recruiter-engagement/infrastructure/sqlite
git commit -m "feat(search): restore Codex execution settings to research settings"
```

---

### Task 6: The Codex research source — DONE (c01e093)

**Files:**
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.test.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-policy.ts`
- Create: `src/contexts/recruiter-engagement/infrastructure/codex/codex-policy.test.ts`

**Interfaces:**
- Consumes: `CodexClient` (Task 2), the reply schemas (Task 3), the prompt builders (Task 4), `ResearchExecutionSettings` (Task 5).
- Produces:
  - `const codexAdapterId: string` — `"codex-cli-research:v1"`
  - `function createCodexAdapterPolicy(settings: RecruiterResearchSettings): AdapterPolicySnapshot`
  - `function createCodexSourcePlan(settings: RecruiterResearchSettings): SourcePlanSnapshot`
  - `function createCodexResearchSource(options: { readonly client: CodexClient; readonly execution: () => ResearchExecutionSettings; readonly failures?: ...; readonly now: () => Date }): ResearchSource`

- [ ] **Step 1: Write the failing source test**

Create `src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { researchRunFixture } from "@/contexts/recruiter-engagement/test-support/research-run-fakes";
import { CodexFailure } from "./codex-cli-client";
import { createCodexResearchSource } from "./codex-research-source";

const execution = {
  model: "gpt-5.6-sol",
  reasoningEffort: "high" as const,
  stageRequestLimit: 2,
  stageTimeoutMs: 600_000,
};

function firmReply(count: number) {
  return JSON.stringify({
    firms: Array.from({ length: count }, (_, index) => ({
      companyName: `Firm ${index + 1}`,
      confidence: "high",
      excerpt: "We recruit software engineers in the UAE.",
      hasCurrentMandatesOrActivity: true,
      hasNamedRecruiterOrTeamEvidence: true,
      hasScaleOrTrackRecord: false,
      industries: ["Technology"],
      reason: "Places software engineering roles in the UAE.",
      sourceUrl: `https://firm-${index + 1}.com/about`,
      specialisms: ["Software engineering"],
      targetMarkets: ["United Arab Emirates"],
      websiteUrl: `https://firm-${index + 1}.com`,
    })),
  });
}

function source(complete: (request: unknown) => Promise<string>) {
  return createCodexResearchSource({
    client: { complete: complete as never },
    execution: () => execution,
    now: () => new Date("2026-09-01T00:00:00.000Z"),
  });
}

const run = researchRunFixture({
  brief: {
    criteria: {
      industries: ["Technology"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    description: "",
    firmTarget: 3,
    recruiterTarget: 5,
  },
});

describe("codex research source", () => {
  it("returns firm observations mapped from the reply", async () => {
    const firms = await source(async () => firmReply(3)).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(3);
    expect(firms[0]).toMatchObject({
      kind: "firm",
      companyName: "Firm 1",
      websiteUrl: "https://firm-1.com",
      evidence: { confidence: "high", sourceUrl: "https://firm-1.com/about" },
    });
  });

  it("never returns more firms than the run's firm target", async () => {
    const firms = await source(async () => firmReply(25)).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(3);
  });

  it("spends one stage request for the firms stage", async () => {
    const reserveRequest = vi.fn(async () => true);
    await source(async () => firmReply(1)).findFirms({ reserveRequest, run });
    expect(reserveRequest).toHaveBeenCalledTimes(1);
  });

  it("returns nothing and makes no call when the allowance is spent", async () => {
    const complete = vi.fn(async () => firmReply(1));
    const firms = await source(complete).findFirms({
      reserveRequest: async () => false,
      run,
    });
    expect(firms).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("drops a firm whose reply fails the contract rather than failing the stage", async () => {
    const mixed = JSON.stringify({
      firms: [JSON.parse(firmReply(1)).firms[0], { companyName: "Broken" }],
    });
    const firms = await source(async () => mixed).findFirms({
      reserveRequest: async () => true,
      run,
    });
    expect(firms).toHaveLength(1);
  });

  it("records a source failure and rethrows when the binary fails", async () => {
    const record = vi.fn(async () => {});
    const failing = createCodexResearchSource({
      client: {
        complete: async () => {
          throw new CodexFailure({ code: "codex-invocation-failed", message: "codex exited 3" });
        },
      },
      execution: () => execution,
      failures: { record },
      now: () => new Date(),
    });
    await expect(
      failing.findFirms({ reserveRequest: async () => true, run }),
    ).rejects.toThrow(/codex exited 3/);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ runId: run.id, stage: "firms" }),
    );
  });

  it("passes the configured model and effort to the client", async () => {
    const complete = vi.fn(async () => firmReply(1));
    await source(complete).findFirms({ reserveRequest: async () => true, run });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ execution: expect.objectContaining({ model: "gpt-5.6-sol" }) }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex/codex-research-source.test.ts`
Expected: FAIL, `Failed to resolve import "./codex-research-source"`.

- [ ] **Step 3: Implement the policy**

Create `codex-policy.ts` following `public-web-policy.ts` exactly in shape. `codexAdapterId` is the constant `"codex-cli-research:v1"`. `createCodexAdapterPolicy` sets `allowedPublicSourceScope` to `["Public HTTPS firm pages", "Public professional profile pages"]`, `permittedOperations` to `["Local Codex CLI research with live web search"]`, `rateLimit.stageRequestLimit` from `settings.execution.stageRequestLimit`, and `disabledBehavior` to `"Reject before invoking the local Codex CLI."`. `createCodexSourcePlan` returns two entries, one per stage, with `stageRequestAllowance` taken from `settings.execution.stageRequestLimit` for both stages, and `publicSearch: null`.

`assess` in the source must accept a run whose `sourcePlan.publicSearch` is null, unlike the public-web source which requires it.

- [ ] **Step 4: Implement the source**

Create `codex-research-source.ts`. Shape:

```typescript
export function createCodexResearchSource(options: CodexResearchSourceOptions): ResearchSource {
  return {
    adapterId: codexAdapterId,
    assess(run) {
      if (!run.policy.enabled) return { available: false, message: run.policy.disabledBehavior };
      if (run.policy.id !== codexAdapterId) {
        return {
          available: false,
          message: "The frozen Adapter policy does not permit the local Codex Source.",
        };
      }
      return { available: true };
    },
    async findFirms({ reserveRequest, run, signal }) {
      if (!(await reserveRequest())) return [];
      const reply = await complete(run, "firms", firmDiscoveryInstructions(run), codexFirmJsonSchema, signal);
      const parsed = codexFirmReplySchema.safeParse(reply);
      const firms = parsed.success ? parsed.data.firms : salvageFirms(reply);
      return firms.slice(0, run.budget.firmTarget).map((firm) => toFirmObservation(firm, run, options.now()));
    },
    async findRecruiters({ firms, reserveRequest, run, signal }) { /* mirrors findFirms */ },
  };
}
```

`salvageFirms` parses each element of `reply.firms` individually with the item schema and keeps the ones that pass, which is what makes the "drops a firm whose reply fails the contract" test pass without failing the whole stage. Implement it by exporting the item schemas from Task 3 alongside the reply schemas.

`toFirmObservation` maps to the domain type:

```typescript
function toFirmObservation(firm: CodexFirm, run: ResearchRun, observedAt: Date): FirmObservation {
  return {
    kind: "firm",
    companyName: firm.companyName,
    websiteUrl: firm.websiteUrl,
    reason: firm.reason,
    industries: firm.industries,
    specialisms: firm.specialisms,
    rankingSignals: {
      currentMandatesOrActivity: firm.hasCurrentMandatesOrActivity,
      namedRecruiterOrTeamEvidence: firm.hasNamedRecruiterOrTeamEvidence,
      scaleOrTrackRecord: firm.hasScaleOrTrackRecord,
      targetMarkets: firm.targetMarkets,
    },
    evidence: {
      adapterId: run.policy.id,
      confidence: firm.confidence,
      excerpt: firm.excerpt,
      observedAt: observedAt.toISOString().slice(0, 10),
      policyVersion: run.policy.version,
      sourceUrl: firm.sourceUrl,
    },
  };
}
```

On a `CodexFailure`, record a source failure through `options.failures?.record` with `adapterId`, `message`, `recordedAt`, `runId` and `stage`, then rethrow so `executeResearchRun` marks the run failed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement/infrastructure/codex`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/recruiter-engagement/infrastructure/codex
git commit -m "feat(search): research firms and recruiters through the local Codex CLI"
```

---

### Task 7: Wire the source into composition — DONE (c6b7dfe)

**Files:**
- Modify: `src/contexts/recruiter-engagement/composition/recruiter-engagement-web.server.ts:60-77` and `:170-200`
- Test: `src/contexts/recruiter-engagement/composition/recruiter-engagement-web.server.test.ts` if one exists; otherwise assert through the existing route tests.

**Interfaces:**
- Consumes: everything from Tasks 2 to 6.
- Produces: a default research source that is the Codex source, with the deterministic source still selected by `JOB_RADAR_RECRUITER_RESEARCH_SOURCE=deterministic`.

- [ ] **Step 1: Select the source**

Replace the `source` construction so the order is: deterministic when `JOB_RADAR_RECRUITER_RESEARCH_SOURCE === "deterministic"`, otherwise the Codex source. Keep `publicSources` constructed and available, because `startResearchRun` still offers provider selection, but it is no longer the default research path.

```typescript
const codexSource = createCodexResearchSource({
  client: createCodexCliClient({
    binaryPath: process.env.JOB_RADAR_CODEX_BINARY ?? "codex",
    scratchDirectory: tmpdir(),
  }),
  execution: () => currentSettings().execution,
  failures: sourceFailures,
  now: () => new Date(),
});
```

`JOB_RADAR_CODEX_BINARY` is a deployment-specific path, so it belongs in the environment and must be added to `.env.example` with an empty value and a comment naming the default.

- [ ] **Step 2: Freeze the Codex policy on a new run**

In `startResearchRun`, use `createCodexAdapterPolicy(settings)` and `createCodexSourcePlan(settings)` in place of the public-web pair when the Codex source is selected. A run frozen against the public-web policy must still execute against the public-web source, which the existing `assess` guards already enforce.

- [ ] **Step 3: Run the context suite**

Run: `pnpm exec vitest run src/contexts/recruiter-engagement`
Expected: PASS.

- [ ] **Step 4: Run the architecture tests**

Run: `pnpm exec vitest run tests/architecture`
Expected: PASS. `infrastructure` may import `application` and `domain` and `src/platform`; the new directory breaks no rule. If a test forbids `node:child_process` outside `src/platform`, stop and raise it with the user rather than moving the adapter.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/recruiter-engagement/composition .env.example
git commit -m "feat(search): make the local Codex Source the default research path"
```

---

### Task 8: Real-boundary smoke check — DONE (aa7bef4)

**Files:**
- Create: `scripts/smoke-codex-research.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createCodexCliClient`, `createCodexResearchSource`, the schemas and prompts.
- Produces: `pnpm test:smoke:codex`.

A mock proves the code's response to a collaborator. It does not prove `codex exec` accepts the argument vector or that `z.toJSONSchema` output is a schema the binary honours. This task is that proof, and a failure here blocks completion even with every unit test green.

- [ ] **Step 1: Write the smoke script**

Create `scripts/smoke-codex-research.ts` that builds a real `createCodexCliClient`, builds a `ResearchRun` with `firmTarget: 2` and one real target location, calls `findFirms` with a `reserveRequest` that returns true once, then asserts: the call resolves, returns between 0 and 2 firms, and every returned firm has an https `websiteUrl` and a non-empty `evidence.sourceUrl`. Print the firms and exit non-zero on any failure.

- [ ] **Step 2: Add the script**

In `package.json` scripts, add:

```json
"test:smoke:codex": "tsx scripts/smoke-codex-research.ts"
```

Use whichever TypeScript runner the repository already depends on; read the existing scripts block first and match it. Do not add a runner dependency for this.

- [ ] **Step 3: Run it**

Run: `pnpm test:smoke:codex`
Expected: exit 0, with the firms printed. Budget several minutes; effort `high` with live search is not fast.

Common failures and their causes: a hang means stdin was not set to `ignore`; `unexpected argument` means the argument vector drifted from `codex exec --help`; a schema rejection means `z.toJSONSchema` emitted `$ref`s and Task 3's fallback note applies.

- [ ] **Step 4: Do not wire it into the gate**

`pnpm verify` stays as it is. Adding a network-dependent, plan-metered, minutes-long check to the push gate is a gate change; propose it to the user and let them decide.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-codex-research.ts package.json
git commit -m "test(search): smoke the Codex research boundary end to end"
```

---

### Task 9: Settings surface for execution — DONE (2edd509, b43ef85)

**Files:**
- Modify: the Settings route under `src/contexts/discovery/presentation/web` that renders recruiter research settings — find it with `rg -l "getPublicSearchSettings" src`
- Create: `src/contexts/recruiter-engagement/presentation/web/requests/execution-settings-request.ts`

**Interfaces:**
- Consumes: `createSaveExecutionSettings` (Task 5).
- Produces: a Settings form section for model, reasoning effort, stage request allowance and stage timeout.

- [ ] **Step 1: Read the incumbent surface first**

Read the existing public search settings form and the design-system component that owns each control before writing markup. Reuse `@job-radar/design-ui` components and their public variants. Reasoning effort is a fixed vocabulary, so it is a catalogue-backed select, never free text. Do not recreate component markup or add page-level overrides.

- [ ] **Step 2: Write the failing request test**

Mirror `public-search-settings-request.ts` and its test: a Zod schema over `FormData` that rejects an unknown reasoning effort, rejects a non-numeric timeout, and maps valid input to the application command.

- [ ] **Step 3: Implement the request schema and the form section**

- [ ] **Step 4: Capture UI evidence**

Capture the Settings route at desktop and mobile widths in light and dark themes against port 3199 with a disposable database, per the repository's UI evidence rule. Keep the screenshots as ignored local evidence and record route, viewport and theme.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/recruiter-engagement/presentation src/contexts/discovery/presentation
git commit -m "feat(search): expose Codex execution settings in Settings"
```

---

### Task 10: Full gate and tracker

- [ ] **Step 1: Run the whole gate once on the final tree**

Run: `pnpm verify`
Expected: exit 0. `pnpm test:browser` currently reports 49 passed, 1 failed; that failure is ADM-298 and is pre-existing. Any other failure is this batch's.

- [ ] **Step 2: Run the smoke check on the final tree**

Run: `pnpm test:smoke:codex`
Expected: exit 0.

- [ ] **Step 3: Update the tracker**

ADM-302 and ADM-305 are closed by this batch; state on each issue which test proves it, by file and test name. ADM-304 is closed only in the sense that unqualified firms no longer enter the directory from the Codex source; say that plainly rather than closing it silently. Raise a new issue for any defect found during implementation, including one found and fixed in the same commit.

- [ ] **Step 4: Update the handoff**

Rewrite `.handoff/current.md` with the verified state, the remaining ADM-303 work, and the exact commands. Keep it local and uncommitted.

---

## Out of scope, and why

- **ADM-303, run-scoped results and the separate directory surface.** The user chose to keep the accumulated cross-run directory as its own browsing page. That is a presentation change plus a directory query change, independent of where observations come from, and it is the next batch.
- **Removing the public web search adapters.** They stay selectable. Deleting a working source in the same batch that introduces its replacement would make a regression impossible to isolate.
- **An LLM grader over provider snippets.** Superseded: the Codex source reads the firms' own sites, so there is no snippet to grade.

## Open question for the user, not to be decided by an implementer

The technology focus decision was made when provider search was still the engine, and Task 5 restores the technology-qualified `firmDiscoveryPhrases` accordingly. Those phrases now only affect the public web search source, which is no longer the default path. On the Codex path the technology focus is carried by the brief's own specialisms. If the user wants the Codex prompt to additionally insist on technology recruitment regardless of the brief, that is a seeded prompt policy setting and a further task; it is not assumed here.
