import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapAdvisorSettings,
  defaultAdvisorPolicy,
  getAdvisorPolicy,
  saveAdvisorSettings,
} from "./advisor-settings";
import * as schema from "./schema";

describe("Advisor settings persistence", () => {
  const openDatabases: Database.Database[] = [];

  afterEach(() => {
    for (const sqlite of openDatabases) sqlite.close();
    openDatabases.length = 0;
  });

  it("seeds the Advisor policy once and preserves later Settings changes", () => {
    const database = createDatabase(openDatabases);

    bootstrapAdvisorSettings(database, new Date("2026-09-14T08:00:00.000Z"));
    expect(getAdvisorPolicy(database)).toEqual(defaultAdvisorPolicy);

    expect(
      saveAdvisorSettings(
        database,
        { ...defaultAdvisorPolicy, enabled: true },
        new Date("2026-09-14T09:00:00.000Z"),
      ),
    ).toEqual({
      ...defaultAdvisorPolicy,
      enabled: true,
      policyVersion: 2,
    });

    bootstrapAdvisorSettings(database, new Date("2026-09-14T10:00:00.000Z"));
    expect(getAdvisorPolicy(database)).toEqual({
      ...defaultAdvisorPolicy,
      enabled: true,
      policyVersion: 2,
    });
  });

  it("persists the execution settings consumed by subsequent Advisor runs", () => {
    const database = createDatabase(openDatabases);
    bootstrapAdvisorSettings(database);
    const command = {
      enabled: true,
      model: "another-test-model",
      reasoningEffort: "medium",
      timeoutMs: 17_000,
      outputLimit: 6_000,
    };
    expect(saveAdvisorSettings(database, command)).toEqual({
      ...command,
      policyVersion: 2,
      schemaVersion: defaultAdvisorPolicy.schemaVersion,
    });
    expect(getAdvisorPolicy(database)).toEqual({
      ...command,
      policyVersion: 2,
      schemaVersion: defaultAdvisorPolicy.schemaVersion,
    });
    expect(() => saveAdvisorSettings(database, { ...command, timeoutMs: 0 })).toThrow();
    expect(getAdvisorPolicy(database).timeoutMs).toBe(17_000);
  });

  it("rejects missing, malformed, and unrecognised persisted policy", () => {
    const database = createDatabase(openDatabases);
    expect(() => getAdvisorPolicy(database)).toThrow(/missing or invalid/i);

    database.$client
      .prepare("INSERT INTO advisor_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("default", JSON.stringify({ ...defaultAdvisorPolicy, timeoutMs: 999 }), Date.now());
    expect(() => getAdvisorPolicy(database)).toThrow(/missing or invalid/i);

    database.$client
      .prepare("UPDATE advisor_settings SET value = ? WHERE key = ?")
      .run(JSON.stringify({ ...defaultAdvisorPolicy, extraPolicy: true }), "default");
    expect(() => getAdvisorPolicy(database)).toThrow(/missing or invalid/i);
  });
});

function createDatabase(openDatabases: Database.Database[]) {
  const sqlite = new Database(":memory:");
  openDatabases.push(sqlite);
  const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
  if (!schemaPath) throw new Error("The test schema path was not configured");
  sqlite.exec(readFileSync(schemaPath, "utf8"));
  return drizzle(sqlite, { schema });
}
