import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("contains schema changes without application records", () => {
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    expect(schemaPath).toBeDefined();
    const sql = readFileSync(schemaPath ?? "", "utf8");
    expect(sql).toContain("CREATE TABLE");
    expect(recordStatementsIn(sql)).toEqual([]);
  });

  it("reports a record statement however it is dressed up", () => {
    expect(recordStatementsIn("UPDATE `jobs` SET `is_active` = 0;")).toEqual(["UPDATE"]);
    expect(recordStatementsIn("  delete from `jobs`;")).toEqual(["DELETE"]);
    expect(recordStatementsIn("REPLACE INTO `jobs` VALUES (1);")).toEqual(["REPLACE"]);
    expect(
      recordStatementsIn("WITH chosen(id) AS (VALUES (1)) UPDATE `jobs` SET `is_active` = 0;"),
    ).toEqual(["WITH"]);
    expect(
      recordStatementsIn(
        "-- CREATE TRIGGER data follows\nUPDATE `jobs` SET `is_active` = 0;\n-- END;",
      ),
    ).toEqual(["UPDATE"]);
    expect(recordStatementsIn("/* CREATE TRIGGER x BEGIN END; */\nDELETE FROM `jobs`;")).toEqual([
      "DELETE",
    ]);
    expect(
      recordStatementsIn(
        "BEGIN TRANSACTION;\n--> statement-breakpoint\nUPDATE `jobs` SET `is_active` = 0;",
      ),
    ).toEqual(["BEGIN", "UPDATE"]);
    expect(
      recordStatementsIn(`${trigger}\n--> statement-breakpoint\nINSERT INTO \`jobs\` VALUES (1);`),
    ).toEqual(["INSERT"]);
    expect(
      recordStatementsIn("CREATE INDEX `a` ON `jobs` (`id`); UPDATE `jobs` SET `is_active` = 0;"),
    ).toEqual(["UPDATE"]);
  });

  it("permits the schema statements a migration is made of", () => {
    expect(recordStatementsIn(trigger)).toEqual([]);
    expect(recordStatementsIn(triggerWithCase)).toEqual([]);
    expect(recordStatementsIn(`-- keeps the copy in step\n${trigger}`)).toEqual([]);
    expect(
      recordStatementsIn(
        "CREATE INDEX `a` ON `jobs` (`id`);--> statement-breakpoint\nDROP INDEX `a`;",
      ),
    ).toEqual([]);
    expect(
      recordStatementsIn(
        "ALTER TABLE `jobs` ADD `x` integer REFERENCES `b`(`id`) ON DELETE cascade;",
      ),
    ).toEqual([]);
  });
});

// An allowlist rather than a denylist. A migration statement opens with a schema verb, so a record
// statement is anything that does not, and the guard cannot be walked past by a form nobody thought
// of: `WITH ... UPDATE`, `REPLACE INTO` and a bare `INSERT` all fail the same way. A trigger needs no
// special case, because `CREATE TRIGGER` opens with `CREATE` and its body is never the statement's
// first word. Comments come off first so a documented statement is read by its verb.
const schemaVerbs = /^(?:CREATE|ALTER|DROP|PRAGMA|ANALYZE|REINDEX|VACUUM)\b/i;

function recordStatementsIn(sql: string): readonly string[] {
  return sql
    .split("--> statement-breakpoint")
    .map(withoutComments)
    .flatMap(statementsIn)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "")
    .filter((statement) => !schemaVerbs.test(statement))
    .map(openingWordOf);
}

// A trigger body holds semicolons of its own, so it is read whole. Everything else is split, because
// a statement chained after a schema statement in one segment would otherwise inherit its verb.
function statementsIn(segment: string): readonly string[] {
  return /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(segment)
    ? [segment]
    : segment.split(";");
}

function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function openingWordOf(statement: string): string {
  return statement.split(/[\s(;]/, 1)[0]?.toUpperCase() ?? "";
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
