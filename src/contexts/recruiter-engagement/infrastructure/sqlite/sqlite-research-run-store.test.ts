import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import {
  continueResearchRun,
  createResearchRun,
  type ResearchRun,
} from "@/contexts/recruiter-engagement/domain/research-run";
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

  it("stores and returns the execution settings a run froze into its source plan", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const execution = {
      model: "retired-model",
      reasoningEffort: "low" as const,
      stageTimeoutMs: 71_000,
    };
    const run = createResearchRun({
      id: "run-frozen-execution",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: { ...testSourcePlan, execution },
      startedAt: new Date("2026-09-02T10:00:00.000Z"),
    });

    await store.create(run);

    expect((await store.get("run-frozen-execution"))?.sourcePlan.execution).toEqual(execution);
  });

  it("returns no frozen execution for a run stored before runs froze one", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const run = createResearchRun({
      id: "run-pre-freeze",
      brief: testSearchBrief(),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-09-02T10:00:00.000Z"),
    });
    const { execution: _absent, ...sourcePlanWithoutExecution } = run.sourcePlan;
    await store.create({
      ...run,
      sourcePlan: sourcePlanWithoutExecution as typeof run.sourcePlan,
    });

    expect((await store.get("run-pre-freeze"))?.sourcePlan.execution).toBeNull();
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
          rankingSignals: {
            currentMandatesOrActivity: true,
            namedRecruiterOrTeamEvidence: true,
            scaleOrTrackRecord: false,
            targetMarkets: ["United Arab Emirates"],
          },
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
        adapterId: "public-web-search:test:v1",
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
          rankingSignals: {
            currentMandatesOrActivity: true,
            namedRecruiterOrTeamEvidence: true,
            scaleOrTrackRecord: false,
            targetMarkets: ["United Arab Emirates"],
          },
          specialisms: ["Software engineering"],
        },
      ],
      new Date("2026-08-27T10:03:00.000Z"),
    );

    expect(lateWrite).toBeUndefined();
    expect((await store.get(run.id))?.status).toBe("cancelled");
    expect(await store.observationsFor(run.id)).toEqual([]);
  });

  it("retains observations returned when a stage exhausts its request allowance", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const run = createResearchRun({
      id: "run-budget-partial",
      brief: testSearchBrief({ recruiterTarget: 1 }),
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    const firm = {
      companyName: "Firm One",
      evidence: testEvidence("https://firm-one.example/evidence"),
      industries: ["Financial services"],
      kind: "firm" as const,
      rankingSignals: {
        currentMandatesOrActivity: true,
        namedRecruiterOrTeamEvidence: true,
        scaleOrTrackRecord: true,
        targetMarkets: ["United Arab Emirates"],
      },
      reason: "Technology recruitment",
      specialisms: ["Software engineering"],
      websiteUrl: "https://firm-one.example",
    };
    const recruiter = {
      companyName: firm.companyName,
      evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
      kind: "recruiter" as const,
      name: "Amina Khan",
      profileUrl: "https://www.linkedin.com/in/amina-khan",
      title: "Technology Recruiter",
    };
    await store.create(run);
    await store.begin(run.id, new Date("2026-08-27T10:01:00.000Z"));
    await store.reserveStageRequest(run.id, "firms", new Date("2026-08-27T10:02:00.000Z"));
    await store.acceptStage(run.id, "firms", [firm], new Date("2026-08-27T10:03:00.000Z"));
    await store.reserveStageRequest(run.id, "recruiters", new Date("2026-08-27T10:04:00.000Z"));
    await store.reserveStageRequest(run.id, "recruiters", new Date("2026-08-27T10:05:00.000Z"));

    const retained = await store.acceptStage(
      run.id,
      "recruiters",
      [recruiter],
      new Date("2026-08-27T10:06:00.000Z"),
    );

    expect(retained).toMatchObject({ status: "partial", checkpoint: "recruiters" });
    await expect(store.observationsFor(run.id)).resolves.toEqual([firm, recruiter]);
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

  it("carries only the continued run's observations onto a continuation", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const store = createSqliteResearchRunStore(database);
    const seed = async (id: string, firmNames: readonly string[]) => {
      const run = createResearchRun({
        id,
        brief: testSearchBrief({ description: "UAE technology", recruiterTarget: 4 }),
        policy: testAdapterPolicy,
        sourcePlan: testSourcePlan,
        startedAt: new Date("2026-08-27T10:00:00.000Z"),
      });
      await store.create(run);
      await store.begin(id, new Date("2026-08-27T10:01:00.000Z"));
      await store.acceptStage(
        id,
        "firms",
        firmNames.map((companyName) => ({
          kind: "firm" as const,
          companyName,
          websiteUrl: `https://${companyName.toLowerCase().replaceAll(" ", "-")}.example`,
          evidence: testEvidence("https://firm.example/evidence"),
          reason: "Technology recruitment",
          industries: ["Technology"],
          rankingSignals: {
            currentMandatesOrActivity: true,
            namedRecruiterOrTeamEvidence: true,
            scaleOrTrackRecord: true,
            targetMarkets: ["United Arab Emirates"],
          },
          specialisms: ["Software engineering"],
        })),
        new Date("2026-08-27T10:02:00.000Z"),
      );
      await store.cancel(id, new Date("2026-08-27T10:03:00.000Z"));
    };
    await seed("run-continued", ["Firm One", "Firm Two", "Firm Three"]);
    await seed("run-unrelated", ["Other Firm"]);

    const continuation = continueResearchRun({
      id: "run-continuation",
      previous: (await store.get("run-continued")) as ResearchRun,
      startedAt: new Date("2026-08-27T10:04:00.000Z"),
    });
    await store.createContinuation(continuation, "run-continued");

    expect(await store.get("run-continuation")).toMatchObject({
      checkpoint: "recruiters",
      continuedFromRunId: "run-continued",
      retryOfRunId: null,
      status: "pending",
    });
    expect(
      (await store.observationsFor("run-continuation"))
        .map((observation) => (observation.kind === "firm" ? observation.companyName : "?"))
        .toSorted(),
    ).toEqual(["Firm One", "Firm Three", "Firm Two"]);
    expect(await store.observationsFor("run-continued")).toHaveLength(3);
    expect(await store.observationsFor("run-unrelated")).toHaveLength(1);
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
