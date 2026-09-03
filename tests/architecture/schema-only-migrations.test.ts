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

  it("reports a record statement however it is dressed up", () => {
    expect(recordStatementsIn("UPDATE `jobs` SET `is_active` = 0;")).toEqual(["UPDATE"]);
    expect(recordStatementsIn("  delete from `jobs`;")).toEqual(["DELETE"]);
    expect(
      recordStatementsIn(`${trigger}\n--> statement-breakpoint\nINSERT INTO \`jobs\` VALUES (1);`),
    ).toEqual(["INSERT"]);
    expect(
      recordStatementsIn(
        "-- CREATE TRIGGER data follows\nUPDATE `jobs` SET `is_active` = 0;\n-- END;",
      ),
    ).toEqual(["UPDATE"]);
    expect(recordStatementsIn("/* CREATE TRIGGER x BEGIN END; */\nDELETE FROM `jobs`;")).toEqual([
      "DELETE",
    ]);
    expect(
      recordStatementsIn("CREATE INDEX `a` ON `jobs` (`id`); UPDATE `jobs` SET `is_active` = 0;"),
    ).toEqual(["UPDATE"]);
    expect(
      recordStatementsIn("BEGIN TRANSACTION;\nUPDATE `jobs` SET `is_active` = 0;\nEND;"),
    ).toEqual(["UPDATE"]);
  });

  it("permits the record statements a trigger body is made of", () => {
    expect(recordStatementsIn(trigger)).toEqual([]);
    expect(recordStatementsIn(triggerWithCase)).toEqual([]);
    expect(recordStatementsIn(`-- keeps the copy in step\n${trigger}`)).toEqual([]);
  });
});

// A trigger is a schema object whose body is written in the same verbs a data migration would use.
// Comments come out first, because a commented `CREATE TRIGGER` would otherwise hide the statement
// under it, and a body is only skipped when the statement it belongs to genuinely opens one.
function recordStatementsIn(sql: string): readonly string[] {
  return sql.split("--> statement-breakpoint").map(withoutComments).flatMap(recordVerbsIn);
}

function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function recordVerbsIn(statement: string): readonly string[] {
  const body = /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(statement)
    ? statement.replace(/\bBEGIN\b[\s\S]*\bEND\b/i, "")
    : statement;
  return [...body.matchAll(/(?:^|;)\s*(INSERT|UPDATE|DELETE)\b/gim)]
    .map((match) => match[1]?.toUpperCase())
    .filter((verb): verb is string => verb !== undefined);
}

const trigger = `CREATE TRIGGER \`job_matches_follow_listing_activation\`
AFTER UPDATE OF \`is_active\` ON \`jobs\`
FOR EACH ROW WHEN OLD.\`is_active\` <> NEW.\`is_active\`
BEGIN
  UPDATE \`job_matches\` SET \`listing_is_active\` = NEW.\`is_active\` WHERE \`job_id\` = NEW.\`id\`;
END;`;

const triggerWithCase = `CREATE TRIGGER \`probe\`
AFTER UPDATE OF \`is_active\` ON \`jobs\`
BEGIN
  UPDATE \`job_matches\`
  SET \`listing_is_active\` = CASE WHEN NEW.\`is_active\` = 1 THEN 1 ELSE 0 END
  WHERE \`job_id\` = NEW.\`id\`;
  DELETE FROM \`job_matches\` WHERE \`job_id\` = NEW.\`id\` AND 0 = 1;
END;`;
