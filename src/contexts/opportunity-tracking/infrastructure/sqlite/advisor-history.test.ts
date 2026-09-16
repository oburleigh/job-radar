import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteAdvisorHistory } from "./advisor-history";
import { defaultAdvisorPolicy } from "./advisor-settings";
import * as schema from "./schema";

const openDatabases: Database.Database[] = [];
afterEach(() => {
  for (const sqlite of openDatabases) sqlite.close();
  openDatabases.length = 0;
});
function history() {
  const sqlite = new Database(":memory:");
  openDatabases.push(sqlite);
  const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
  if (!schemaPath) throw new Error("Expected test schema");
  sqlite.exec(readFileSync(schemaPath, "utf8"));
  return createSqliteAdvisorHistory(drizzle(sqlite, { schema }));
}

describe("Advisor execution history", () => {
  it("loads the newest attempt only for the exact capability and owner", () => {
    const store = history();
    const input = {
      kind: "assessment" as const,
      searchProfileId: 7,
      jobListingId: 11,
      applicationId: null,
      policy: defaultAdvisorPolicy,
      startedAt: new Date("2026-09-16T12:00:00Z"),
    };
    expect(store.latest(input)).toBeUndefined();
    store.start(input);
    const newest = store.start(input);
    store.finish({
      id: newest,
      status: "rejected",
      reason: "Unsupported evidence",
      finishedAt: new Date("2026-09-16T12:00:01Z"),
    });
    const later = new Date("2026-09-16T13:00:00Z");
    store.start({ ...input, searchProfileId: 8, startedAt: later });
    store.start({ ...input, jobListingId: 12, startedAt: later });
    store.start({ ...input, kind: "relationship-plan", startedAt: later });
    store.start({ ...input, applicationId: 9, startedAt: later });
    store.start({ ...input, startedAt: new Date("2026-09-16T11:00:00Z") });
    expect(store.latest(input)).toMatchObject({
      id: newest,
      status: "rejected",
      reason: "Unsupported evidence",
    });
  });

  it("retains failure, policy and timing and links only retries of the same capability and owner", () => {
    const store = history();
    const startedAt = new Date("2026-09-14T12:00:00.000Z");
    const policy = { ...defaultAdvisorPolicy, enabled: true, model: "test-model" };
    const input = {
      kind: "assessment" as const,
      searchProfileId: 7,
      jobListingId: 11,
      applicationId: null,
      policy,
      startedAt,
    };
    const first = store.start(input);
    expect(store.list(10)).toEqual([
      { ...input, id: first, status: "running", reason: null, finishedAt: null, retryOf: null },
    ]);
    const finishedAt = new Date("2026-09-14T12:00:03.000Z");
    store.finish({ id: first, status: "failed", reason: "advisor-failed", finishedAt });
    const unrelated = store.start({ ...input, jobListingId: 12 });
    const anotherCapability = store.start({
      ...input,
      kind: "relationship-plan",
      applicationId: 41,
    });
    const retry = store.start({ ...input, startedAt: new Date("2026-09-14T12:01:00.000Z") });
    const rows = store.list(10);
    expect(rows.find((row) => row.id === first)).toEqual({
      ...input,
      id: first,
      status: "failed",
      reason: "advisor-failed",
      finishedAt,
      retryOf: null,
    });
    expect(rows.find((row) => row.id === unrelated)?.retryOf).toBeNull();
    expect(rows.find((row) => row.id === anotherCapability)?.retryOf).toBeNull();
    expect(rows.find((row) => row.id === retry)?.retryOf).toBe(first);
    expect(store.list(1).map((row) => row.id)).toEqual([retry]);
    policy.model = "changed-after-start";
    expect(store.list(10).find((row) => row.id === first)?.policy.model).toBe("test-model");
  });

  it("retains terminal outcomes and does not label a fresh completed assessment as a retry", () => {
    const store = history();
    const now = new Date("2026-09-14T12:00:00.000Z");
    const input = {
      kind: "assessment" as const,
      searchProfileId: 7,
      jobListingId: 11,
      applicationId: null,
      policy: defaultAdvisorPolicy,
      startedAt: now,
    };
    const id = store.start(input);
    store.finish({ id, status: "completed", reason: null, finishedAt: now });
    expect(() =>
      store.finish({ id, status: "failed", reason: "overwrite", finishedAt: now }),
    ).toThrow();
    const next = store.start(input);
    expect(store.list(10).find((row) => row.id === next)?.retryOf).toBeNull();
    expect(store.list(10).find((row) => row.id === id)?.status).toBe("completed");
  });
});
