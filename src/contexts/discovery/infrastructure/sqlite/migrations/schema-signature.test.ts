import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { schemaSignature } from "./schema-signature";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("schema signature", () => {
  it("accepts historical ALTER layouts while retaining literal and constraint drift checks", () => {
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("Expected test schema export.");
    const currentSql = readFileSync(schemaPath, "utf8");
    const historicalSql = readFileSync(
      new URL("./historical-schema.fixture.sql", import.meta.url),
      "utf8",
    );
    const current = databaseWith(currentSql);
    const historical = databaseWith(currentSql);
    historical.pragma("foreign_keys = OFF");
    const tables = [...historicalSql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
    for (const table of tables) historical.exec(`DROP TABLE ${table}`);
    historical.exec(historicalSql);
    for (const { sql } of current
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL")
      .all() as { sql: string }[]) {
      historical.exec(
        sql
          .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS")
          .replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"),
      );
    }
    for (const { sql } of current
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger'")
      .all() as { sql: string }[])
      historical.exec(sql);
    historical.exec("DROP INDEX discovery_queries_run_ats_idx");
    historical.exec(
      "CREATE INDEX `discovery_queries_run_ats_idx` ON `discovery_queries` (`run_id`, `ats_type`)",
    );
    expect(schemaSignature(historical)).toBe(schemaSignature(current));
    historical.exec("ALTER TABLE jobs ADD COLUMN unexpected text CHECK (unexpected = 'a  b')");
    expect(schemaSignature(historical)).not.toBe(schemaSignature(current));
  });

  it("is stable for equivalent schemas", () => {
    const left = databaseWith(`
      CREATE TABLE parents (id integer PRIMARY KEY);
      CREATE TABLE children (
        id integer PRIMARY KEY,
        parent_id integer NOT NULL REFERENCES parents(id)
      );
      CREATE UNIQUE INDEX children_parent_id ON children(parent_id);
    `);
    const right = databaseWith(`
      CREATE TABLE parents (id integer PRIMARY KEY);
      CREATE TABLE children (
        id integer PRIMARY KEY,
        parent_id integer NOT NULL REFERENCES parents(id)
      );
      CREATE UNIQUE INDEX children_parent_id ON children(parent_id);
    `);

    expect(schemaSignature(left)).toBe(schemaSignature(right));
  });

  it.each(["a  b", "a\tb", "a\nb", "a'  b"])(
    "distinguishes whitespace within quoted check-constraint value %j",
    (value) => {
      const literal = value.replaceAll("'", "''");
      const left = databaseWith(`CREATE TABLE records (value text CHECK(value = '${literal}'))`);
      const right = databaseWith(
        `CREATE TABLE records (value text CHECK(value = '${literal.replace(/\s+/g, " ")}'))`,
      );

      expect(schemaSignature(left)).not.toBe(schemaSignature(right));
      expect(() => left.prepare("INSERT INTO records VALUES (?)").run(value)).not.toThrow();
      expect(() => right.prepare("INSERT INTO records VALUES (?)").run(value)).toThrow();
    },
  );

  it("ignores formatting outside quoted values", () => {
    const left = databaseWith("CREATE TABLE records (value text CHECK(value = 'a  b'))");
    const right = databaseWith("CREATE TABLE records (value\n  text CHECK(value = 'a  b'))");
    expect(schemaSignature(left)).toBe(schemaSignature(right));
  });

  it.each([
    {
      change: "column",
      left: "CREATE TABLE records (id integer PRIMARY KEY)",
      right: "CREATE TABLE records (id integer PRIMARY KEY, label text)",
    },
    {
      change: "foreign key",
      left: "CREATE TABLE parents (id integer PRIMARY KEY); CREATE TABLE records (parent_id integer)",
      right:
        "CREATE TABLE parents (id integer PRIMARY KEY); CREATE TABLE records (parent_id integer REFERENCES parents(id))",
    },
    {
      change: "index",
      left: "CREATE TABLE records (id integer PRIMARY KEY, label text)",
      right:
        "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE INDEX records_label ON records(label)",
    },
    {
      change: "partial index predicate",
      left: "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE INDEX records_label ON records(label) WHERE label IS NOT NULL",
      right:
        "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE INDEX records_label ON records(label) WHERE label <> ''",
    },
    {
      change: "index expression",
      left: "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE INDEX records_label ON records(lower(label))",
      right:
        "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE INDEX records_label ON records(upper(label))",
    },
    {
      change: "trigger",
      left: "CREATE TABLE records (id integer PRIMARY KEY, label text)",
      right:
        "CREATE TABLE records (id integer PRIMARY KEY, label text); CREATE TRIGGER records_label AFTER UPDATE ON records BEGIN SELECT NEW.label; END",
    },
    {
      change: "check constraint",
      left: "CREATE TABLE records (id integer PRIMARY KEY, state text CHECK (state IN ('open', 'closed')))",
      right:
        "CREATE TABLE records (id integer PRIMARY KEY, state text CHECK (state IN ('open', 'closed', 'held')))",
    },
  ])("changes when the $change contract changes", ({ left, right }) => {
    expect(schemaSignature(databaseWith(left))).not.toBe(schemaSignature(databaseWith(right)));
  });
});

function databaseWith(sql: string): Database.Database {
  const database = new Database(":memory:");
  databases.push(database);
  database.exec(sql);
  return database;
}
