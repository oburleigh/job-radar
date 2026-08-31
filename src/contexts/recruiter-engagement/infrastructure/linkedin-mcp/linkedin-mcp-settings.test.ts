import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import {
  bootstrapLinkedInMcpSettings,
  getLinkedInMcpSettings,
  replaceLinkedInMcpSettings,
} from "./linkedin-mcp-settings";

describe("LinkedIn MCP settings adapter", () => {
  it("starts disabled without inventing an operator endpoint", () => {
    const database = createDatabase();

    bootstrapLinkedInMcpSettings(database, new Date("2026-08-31T10:00:00.000Z"));

    expect(getLinkedInMcpSettings(database)).toEqual({ endpoint: null });
  });

  it("persists a validated local endpoint outside application settings", () => {
    const database = createDatabase();
    bootstrapLinkedInMcpSettings(database);

    replaceLinkedInMcpSettings(
      database,
      { endpoint: "http://127.0.0.1:8765/mcp" },
      new Date("2026-08-31T10:30:00.000Z"),
    );

    expect(getLinkedInMcpSettings(database)).toEqual({
      endpoint: "http://127.0.0.1:8765/mcp",
    });
  });

  it("rejects persisted remote endpoints at the infrastructure boundary", () => {
    const database = createDatabase();
    bootstrapLinkedInMcpSettings(database);

    expect(() =>
      replaceLinkedInMcpSettings(
        database,
        { endpoint: "https://linkedin-mcp.example.com/mcp" },
        new Date(),
      ),
    ).toThrow("loopback HTTP URL");
  });
});

function createDatabase() {
  const sqlite = new Database(":memory:");
  const database = drizzle(sqlite);
  migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return database;
}
