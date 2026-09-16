import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

import { historicalSchemaSql } from "./historical-schema-sql";

export function schemaSignature(sqlite: Database.Database): string {
  const tables = sqlite
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
    )
    .all() as { name: string; sql: string | null }[];

  return JSON.stringify({
    tables: tables.map(({ name, sql }) => ({
      table: name,
      sql: canonicalSchemaSql(sql),
      columns: sqlite
        .prepare(
          'SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY name',
        )
        .all(name),
      foreignKeys: sqlite
        .prepare(
          'SELECT seq, "table", "from", "to", on_update, on_delete, match FROM pragma_foreign_key_list(?) ORDER BY "from", "to"',
        )
        .all(name),
      indexes: (
        sqlite
          .prepare(
            `SELECT il.name, il."unique", il.origin, il.partial, schema.sql
             FROM pragma_index_list(?) il
             LEFT JOIN sqlite_schema schema ON schema.type = 'index' AND schema.name = il.name
             ORDER BY il.name`,
          )
          .all(name) as {
          name: string;
          unique: number;
          origin: string;
          partial: number;
          sql: string | null;
        }[]
      ).map(({ sql, ...index }) => ({ ...index, sql: canonicalSchemaSql(sql) })),
      indexColumns: sqlite
        .prepare(
          "SELECT il.name, xi.seqno, xi.name AS column_name, xi.desc, xi.coll, xi.key FROM pragma_index_list(?) il, pragma_index_xinfo(il.name) xi ORDER BY il.name, xi.seqno",
        )
        .all(name),
    })),
    extras: (
      sqlite
        .prepare(
          "SELECT name, sql FROM sqlite_schema WHERE type IN ('trigger', 'view') ORDER BY name",
        )
        .all() as { name: string; sql: string | null }[]
    ).map(({ name, sql }) => ({ name, sql: normalizeSchemaSql(sql) })),
  });
}

export function assertSchemaSignature(
  sqlite: Database.Database,
  expected: string,
  label: string,
): void {
  if (schemaSignature(sqlite) !== expected) {
    throw new Error(`Unsupported ${label} database schema.`);
  }
}

export function schemaFingerprint(sqlite: Database.Database): string {
  return createHash("sha256").update(schemaSignature(sqlite)).digest("hex");
}

function normalizeSchemaSql(sql: string | null): string | null {
  return (
    sql
      ?.replace(
        /'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/|[ \t\r\n\f]+/g,
        (token) => (/^[ \t\r\n\f]/.test(token) ? " " : token),
      )
      .trim() ?? null
  );
}

function canonicalSchemaSql(sql: string | null): string | null {
  const normalized = normalizeSchemaSql(sql);
  if (normalized === null) return null;
  const fingerprint = createHash("sha256").update(normalized).digest("hex");
  return historicalSchemaSql.get(fingerprint) ?? normalized;
}
