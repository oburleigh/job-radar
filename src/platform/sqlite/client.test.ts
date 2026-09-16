import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireDatabaseLease, DatabaseLeaseUnavailable } from "./database-lease";

const repositoryRoot = process.cwd();

describe("SQLite client lifecycle", () => {
  let directory: string;
  let databasePath: string;
  let child: ChildProcess | null;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-sqlite-client-"));
    databasePath = path.join(directory, "job-radar.sqlite");
    writeFileSync(databasePath, "");
    child = null;
  });

  afterEach(async () => {
    if (child?.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child?.once("exit", resolve));
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it("holds the database lease until close and configures SQLite", async () => {
    child = startClient(databasePath);
    const ready = JSON.parse(await waitForOutput(child, "READY ").then(afterPrefix("READY ")));

    expect(ready).toEqual({
      databasePath: path.resolve(databasePath),
      foreignKeys: 1,
      journalMode: "wal",
    });
    expect(() => acquireDatabaseLease(databasePath)).toThrow(DatabaseLeaseUnavailable);

    child.stdin?.write("close\n");
    await waitForOutput(child, "CLOSED");
    await waitForExit(child);

    const lease = acquireDatabaseLease(databasePath);
    lease.release();
  });

  it("does not lease or materialize the in-memory database sentinel", async () => {
    child = startClient(":memory:");
    const ready = JSON.parse(await waitForOutput(child, "READY ").then(afterPrefix("READY ")));

    expect(ready).toEqual({ databasePath: ":memory:", foreignKeys: 1, journalMode: "memory" });
    expect(existsSync(path.resolve(repositoryRoot, ":memory:"))).toBe(false);
    expect(existsSync(path.resolve(repositoryRoot, ":memory:.lock"))).toBe(false);

    child.stdin?.write("close\n");
    await waitForOutput(child, "CLOSED");
    await waitForExit(child);
  });

  it("creates a missing database directory before acquiring the lease", async () => {
    const nestedDatabasePath = path.join(directory, "nested", "job-radar.sqlite");
    child = startClient(nestedDatabasePath);

    await waitForOutput(child, "READY ");
    expect(existsSync(nestedDatabasePath)).toBe(true);

    child.stdin?.write("close\n");
    await waitForOutput(child, "CLOSED");
    await waitForExit(child);
  });
});

function startClient(targetDatabasePath: string): ChildProcess {
  return spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `import { closeDatabase, databasePath, sqlite } from "./src/platform/sqlite/client.ts";
       const journalMode = sqlite.pragma("journal_mode", { simple: true });
       const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
       process.stdout.write("READY " + JSON.stringify({ databasePath, journalMode, foreignKeys }) + "\\n");
       process.stdin.once("data", () => {
         closeDatabase();
         process.stdout.write("CLOSED\\n");
         process.exit(0);
       });`,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DB_PATH: targetDatabasePath,
        DOTENV_CONFIG_PATH: path.join(directoryFor(targetDatabasePath), "missing.env"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function directoryFor(targetDatabasePath: string): string {
  return targetDatabasePath === ":memory:" ? tmpdir() : path.dirname(targetDatabasePath);
}

function afterPrefix(prefix: string): (output: string) => string {
  return (output) => output.slice(output.indexOf(prefix) + prefix.length).split("\n", 1)[0] ?? "";
}

async function waitForOutput(child: ChildProcess, expected: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(expected)) resolve(output);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      errors += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output.includes(expected)) {
        reject(new Error(`SQLite client child exited with code ${code}: ${errors}`));
      }
    });
  });
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
}
