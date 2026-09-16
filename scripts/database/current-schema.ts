import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { schemaSignature } from "@/contexts/discovery/infrastructure/sqlite/migrations/schema-signature";

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
