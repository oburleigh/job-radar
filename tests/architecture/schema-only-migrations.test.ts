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
      expect(recordStatementsIn(sql), migration).toEqual([]);
    }
  });

  it("still reports a record statement that a trigger does not enclose", () => {
    expect(recordStatementsIn("UPDATE `jobs` SET `is_active` = 0;")).toEqual(["UPDATE"]);
    expect(recordStatementsIn("  delete from `jobs`;")).toEqual(["DELETE"]);
    expect(recordStatementsIn(`${trigger}\nINSERT INTO \`jobs\` VALUES (1);`)).toEqual(["INSERT"]);
  });

  it("permits the record statements a trigger body is made of", () => {
    expect(recordStatementsIn(trigger)).toEqual([]);
  });
});

// A trigger is a schema object whose body is written in the same verbs a data migration would use.
// The guard reads what a trigger does not enclose, and a lazy match stops at the first `END;`, so a
// body it fails to recognise is reported rather than skipped.
function recordStatementsIn(sql: string): readonly string[] {
  return [
    ...sql
      .replace(/CREATE\s+TRIGGER[\s\S]*?\bEND\s*;/gi, "")
      .matchAll(/^[^\S\n]*(INSERT|UPDATE|DELETE)\b/gim),
  ]
    .map((match) => match[1]?.toUpperCase())
    .filter((verb): verb is string => verb !== undefined);
}

const trigger = `CREATE TRIGGER \`job_matches_follow_listing_activation\`
AFTER UPDATE OF \`is_active\` ON \`jobs\`
FOR EACH ROW WHEN OLD.\`is_active\` <> NEW.\`is_active\`
BEGIN
  UPDATE \`job_matches\` SET \`listing_is_active\` = NEW.\`is_active\` WHERE \`job_id\` = NEW.\`id\`;
END;`;
