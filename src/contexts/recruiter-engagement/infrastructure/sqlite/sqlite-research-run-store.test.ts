import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import {
  createResearchRun,
  createSearchBrief,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testEvidence,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createSqliteResearchRunStore } from "./sqlite-research-run-store";

describe("SQLite research run store", () => {
  it("resumes at the durable checkpoint without duplicating an earlier firm observation", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const run = createResearchRun({
      id: "run-1",
      brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
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
          linkedInUrl: "https://www.linkedin.com/in/amina-khan",
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
      brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
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
      brief: createSearchBrief({ description: "UAE technology", recruiterTarget: 1 }),
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
    migrate(database, { migrationsFolder });

    sqlite.exec(
      "DROP TABLE recruiter_research_observations; DROP TABLE recruiter_research_source_failures; DROP TABLE recruiter_research_runs;",
    );
    sqlite
      .prepare(
        "DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)",
      )
      .run();

    migrate(database, { migrationsFolder });

    expect(sqlite.prepare("PRAGMA table_info(recruiter_research_runs)").all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "criteria" }),
        expect.objectContaining({ name: "budget" }),
        expect.objectContaining({ name: "retry_of_run_id" }),
      ]),
    );
  });
});
