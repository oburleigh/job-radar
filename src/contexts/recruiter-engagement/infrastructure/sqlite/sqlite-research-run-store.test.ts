import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testEvidence,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createSqliteResearchRunStore } from "./sqlite-research-run-store";

describe("SQLite research run store", () => {
  it("lists every Research Run newest first for Activity", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const older = createResearchRun({
      id: "run-older",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const newer = createResearchRun({
      id: "run-newer",
      brief: older.brief,
      policy: older.policy,
      sourcePlan: older.sourcePlan,
      startedAt: new Date("2026-08-28T10:00:00.000Z"),
    });

    await store.create(older);
    await store.create(newer);

    await expect(store.listAll()).resolves.toEqual([newer, older]);
  });

  it("records independent Source failures for the same run stage", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const run = createResearchRun({
      id: "run-source-failures",
      brief: testSearchBrief({ recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-31T10:00:00.000Z"),
    });
    await store.create(run);

    await store.recordSourceFailure(run.id, {
      adapterId: "source-one",
      message: "First source failed.",
      recordedAt: new Date("2026-08-31T10:01:00.000Z"),
      stage: "firms",
    });
    await store.recordSourceFailure(run.id, {
      adapterId: "source-two",
      message: "Second source failed.",
      recordedAt: new Date("2026-08-31T10:02:00.000Z"),
      stage: "firms",
    });

    await expect(store.failuresFor(run.id)).resolves.toEqual([
      expect.objectContaining({ adapterId: "source-one", message: "First source failed." }),
      expect.objectContaining({ adapterId: "source-two", message: "Second source failed." }),
    ]);
  });

  it("resumes at the durable checkpoint without duplicating an earlier firm observation", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const run = createResearchRun({
      id: "run-1",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      retryOfRunId: "run-original",
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const firstProcess = createSqliteResearchRunStore(database);
    await firstProcess.create(run);
    await firstProcess.begin(run.id, new Date("2026-08-27T10:01:00.000Z"));
    await firstProcess.acceptStage(
      run.id,
      "firms",
      [
        {
          kind: "firm",
          companyName: "Firm One",
          websiteUrl: "https://firm-one.example",
          evidence: testEvidence("https://firm-one.example/evidence"),
          reason: "Technology recruitment",
          industries: ["Financial services"],
          specialisms: ["Software engineering"],
        },
      ],
      new Date("2026-08-27T10:02:00.000Z"),
    );

    const restartedProcess = createSqliteResearchRunStore(database);
    expect(
      (await restartedProcess.begin(run.id, new Date("2026-08-27T10:03:00.000Z")))?.checkpoint,
    ).toBe("recruiters");
    await restartedProcess.acceptStage(
      run.id,
      "recruiters",
      [
        {
          kind: "recruiter",
          name: "Amina Khan",
          title: "Technology Recruiter",
          companyName: "Firm One",
          profileUrl: "https://www.linkedin.com/in/amina-khan",
          evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
        },
      ],
      new Date("2026-08-27T10:04:00.000Z"),
    );
    await restartedProcess.complete(run.id, new Date("2026-08-27T10:05:00.000Z"));

    expect(await restartedProcess.observationsFor(run.id)).toHaveLength(2);
    expect((await restartedProcess.observationsFor(run.id))[0]).toMatchObject({
      evidence: {
        adapterId: "local-codex-cli-web-search-v1",
        sourceUrl: "https://firm-one.example/evidence",
      },
    });
    expect((await restartedProcess.get(run.id))?.status).toBe("completed");
    expect((await restartedProcess.get(run.id))?.retryOfRunId).toBe("run-original");
  });

  it("keeps a cancelled run terminal when a late source result arrives", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const run = createResearchRun({
      id: "run-2",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    await store.create(run);
    await store.begin(run.id, new Date("2026-08-27T10:01:00.000Z"));
    await store.cancel(run.id, new Date("2026-08-27T10:02:00.000Z"));

    const lateWrite = await store.acceptStage(
      run.id,
      "firms",
      [
        {
          kind: "firm",
          companyName: "Late Firm",
          websiteUrl: "https://late.example",
          evidence: testEvidence("https://late.example/evidence"),
          reason: "Technology recruitment",
          industries: ["Financial services"],
          specialisms: ["Software engineering"],
        },
      ],
      new Date("2026-08-27T10:03:00.000Z"),
    );

    expect(lateWrite).toBeUndefined();
    expect((await store.get(run.id))?.status).toBe("cancelled");
    expect(await store.observationsFor(run.id)).toEqual([]);
  });

  it("rejects malformed persisted JSON at the SQLite boundary", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const run = createResearchRun({
      id: "run-malformed",
      brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    await store.create(run);
    sqlite
      .prepare("UPDATE recruiter_research_runs SET policy = ? WHERE id = ?")
      .run(JSON.stringify({ enabled: true }), run.id);

    await expect(store.get(run.id)).rejects.toThrow("Invalid persisted recruiter research run");
  });

  it("migrates the final recruiter schema onto an existing pre-0008 database", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    const legacyMigrationsFolder = migrationPrefix(migrationsFolder, 7);

    try {
      migrate(database, { migrationsFolder: legacyMigrationsFolder });
      migrate(database, { migrationsFolder });

      expect(sqlite.prepare("PRAGMA table_info(recruiter_research_runs)").all()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "criteria" }),
          expect.objectContaining({ name: "budget" }),
          expect.objectContaining({ name: "retry_of_run_id" }),
        ]),
      );
    } finally {
      rmSync(legacyMigrationsFolder, { recursive: true, force: true });
    }
  });
});

function migrationPrefix(migrationsFolder: string, lastIndex: number): string {
  const directory = mkdtempSync(path.join(tmpdir(), "job-radar-migrations-"));
  const metaDirectory = path.join(directory, "meta");
  mkdirSync(metaDirectory);
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
  writeFileSync(
    path.join(metaDirectory, "_journal.json"),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
  for (const entry of entries) {
    cpSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(directory, `${entry.tag}.sql`),
    );
  }
  return directory;
}
