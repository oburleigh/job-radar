import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("contains schema changes without application records", () => {
    const migrationDirectory = path.resolve(process.cwd(), "drizzle");
    const migrations = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql"));

    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      const sql = readFileSync(path.join(migrationDirectory, migration), "utf8");
      expect(sql, migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
    }
  });
});
