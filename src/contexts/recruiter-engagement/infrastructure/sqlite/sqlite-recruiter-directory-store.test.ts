import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createRecruiterDirectoryMaintenance } from "@/contexts/recruiter-engagement/application/directory/maintain-recruiter-directory";
import { testEvidence } from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createSqliteRecruiterDirectoryStore } from "./sqlite-recruiter-directory-store";

describe("SQLite recruiter directory store", () => {
  it("retains canonical identities and evidence across process restarts", async () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const firstProcess = createRecruiterDirectoryMaintenance({
      store: createSqliteRecruiterDirectoryStore(database),
    });
    await firstProcess.reconcile({
      observations: observations(),
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    const restartedProcess = createRecruiterDirectoryMaintenance({
      store: createSqliteRecruiterDirectoryStore(database),
    });
    await restartedProcess.reconcile({
      observations: observations(),
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });

    await expect(restartedProcess.getDirectory()).resolves.toMatchObject({
      evidence: [{ runIds: ["run-1", "run-2"] }, { runIds: ["run-1", "run-2"] }],
      firms: [{ name: "Firm One" }],
      recruiters: [{ name: "Amina Khan" }],
    });
  });

  it("rejects malformed persisted directory data at the SQLite boundary", async () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    sqlite
      .prepare("INSERT INTO recruiter_directory_state (key, payload, updated_at) VALUES (?, ?, ?)")
      .run("default", JSON.stringify({ firms: "invalid" }), Date.now());

    await expect(createSqliteRecruiterDirectoryStore(database).load()).rejects.toThrow(
      "Invalid persisted recruiter directory",
    );
  });
});

function observations() {
  return [
    {
      companyName: "Firm One",
      evidence: testEvidence("https://firm-one.example/evidence"),
      industries: ["Financial services"],
      kind: "firm" as const,
      rankingSignals: {
        currentMandatesOrActivity: true,
        namedRecruiterOrTeamEvidence: true,
        scaleOrTrackRecord: false,
        targetMarkets: ["United Arab Emirates"],
      },
      reason: "Software engineering recruitment",
      specialisms: ["Software engineering"],
      websiteUrl: "https://firm-one.example",
    },
    {
      companyName: "Firm One",
      evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
      kind: "recruiter" as const,
      profileUrl: "https://www.linkedin.com/in/amina-khan",
      name: "Amina Khan",
      title: "Software Engineering Recruiter",
    },
  ];
}
