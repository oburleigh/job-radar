import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireDatabaseLease, DatabaseLeaseUnavailable } from "./database-lease";

describe("database lease", () => {
  let directory: string;
  let databasePath: string;
  let child: ChildProcess | null;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "job-radar-database-lease-"));
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

  it("prevents a second owner of the same database until release", () => {
    const lease = acquireDatabaseLease(databasePath);

    expect(() => acquireDatabaseLease(databasePath)).toThrow(DatabaseLeaseUnavailable);

    lease.release();
    const nextLease = acquireDatabaseLease(databasePath);
    nextLease.release();
  });

  it("does not couple leases for different database paths", () => {
    const otherDatabasePath = path.join(directory, "other.sqlite");
    writeFileSync(otherDatabasePath, "");

    const first = acquireDatabaseLease(databasePath);
    const second = acquireDatabaseLease(otherDatabasePath);

    second.release();
    first.release();
  });

  it("reports the locked database without exposing the package error", () => {
    const lease = acquireDatabaseLease(databasePath);

    expect(() => acquireDatabaseLease(databasePath)).toThrow(
      new DatabaseLeaseUnavailable(databasePath),
    );

    lease.release();
  });

  it("preserves filesystem errors that are not lock contention", () => {
    const missingDatabasePath = path.join(directory, "missing", "job-radar.sqlite");

    try {
      acquireDatabaseLease(missingDatabasePath);
      throw new Error("Expected lease acquisition to fail.");
    } catch (error) {
      expect(error).not.toBeInstanceOf(DatabaseLeaseUnavailable);
      expect(error).toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects a database held by another process", async () => {
    child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import { acquireDatabaseLease } from "./src/platform/sqlite/database-lease.ts";
         acquireDatabaseLease(${JSON.stringify(databasePath)});
         process.stdout.write("LOCKED\\\\n");
         setInterval(() => {}, 1000);`,
      ],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForOutput(child, "LOCKED");

    expect(() => acquireDatabaseLease(databasePath)).toThrow(DatabaseLeaseUnavailable);
  });

  it("uses one lease identity for a database and its filesystem alias", async () => {
    const aliasPath = path.join(directory, "database-alias.sqlite");
    symlinkSync(databasePath, aliasPath);
    child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import { acquireDatabaseLease } from "./src/platform/sqlite/database-lease.ts";
         acquireDatabaseLease(${JSON.stringify(databasePath)});
         process.stdout.write("LOCKED\\n");
         setInterval(() => {}, 1000);`,
      ],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForOutput(child, "LOCKED");

    expect(() => acquireDatabaseLease(aliasPath)).toThrow(DatabaseLeaseUnavailable);
  });
});

async function waitForOutput(child: ChildProcess, expected: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(expected)) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output.includes(expected)) reject(new Error(`Lease child exited with code ${code}.`));
    });
  });
}
