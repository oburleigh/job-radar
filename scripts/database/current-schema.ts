import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function exportCurrentSchema(): string {
  return (
    execFileSync("pnpm", ["exec", "drizzle-kit", "export", "--config=drizzle.config.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }) +
    "\n--> statement-breakpoint\n" +
    readFileSync(
      path.resolve("src/contexts/discovery/infrastructure/sqlite/listing-activation.sql"),
      "utf8",
    )
  );
}

export function initializeCurrentSchema(
  database: { $client: Database.Database },
  sql?: string,
): void {
  const schema = sql ?? exportCurrentSchema();
  const sqlite = database.$client;
  const expected = new Database(":memory:");
  try {
    expected.exec(schema);
    sqlite.transaction(() => {
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
        )
        .pluck()
        .all();
      if (tables.length === 0) {
        sqlite.exec(schema);
      } else if (schemaSignature(sqlite) !== schemaSignature(expected)) {
        throw new Error(
          "Unsupported existing database schema. Back up this database and migrate it explicitly before running db:setup; automatic schema upgrades are not supported.",
        );
      }
    })();
  } finally {
    expected.close();
  }
}

function schemaSignature(sqlite: Database.Database): string {
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
    )
    .pluck()
    .all();
  return JSON.stringify({
    tables: tables.map((name) => {
      const table = String(name);
      const columns = sqlite
        .prepare(
          'SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY name',
        )
        .all(table);
      const foreignKeys = sqlite
        .prepare(
          'SELECT seq, "table", "from", "to", on_update, on_delete, match FROM pragma_foreign_key_list(?) ORDER BY "from", "to"',
        )
        .all(table);
      const indexes = sqlite
        .prepare('SELECT name, "unique", origin, partial FROM pragma_index_list(?) ORDER BY name')
        .all(table);
      const indexColumns = sqlite
        .prepare(
          "SELECT il.name, xi.seqno, xi.name AS column_name, xi.desc, xi.coll, xi.key FROM pragma_index_list(?) il, pragma_index_xinfo(il.name) xi ORDER BY il.name, xi.seqno",
        )
        .all(table);
      return { table, columns, foreignKeys, indexes, indexColumns };
    }),
    extras: sqlite
      .prepare(
        "SELECT name, sql FROM sqlite_schema WHERE type IN ('trigger', 'view') ORDER BY name",
      )
      .all(),
  });
}
