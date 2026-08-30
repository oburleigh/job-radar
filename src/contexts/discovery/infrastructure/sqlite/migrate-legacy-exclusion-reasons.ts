import { eq, sql } from "drizzle-orm";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";

import type { db } from "./database";
import { jobMatches } from "./schema";
import { screeningCountColumns } from "./screening-count-columns";

type Database = typeof db;

export function migrateLegacyExclusionReasons(database: Database): number {
  const rows = database
    .select({ id: jobMatches.id, exclusionReasons: jobMatches.exclusionReasons })
    .from(jobMatches)
    .where(sql`EXISTS (
      SELECT 1
      FROM json_each(${jobMatches.exclusionReasons}) AS exclusion_reason
      WHERE exclusion_reason.type = 'text'
    )`)
    .all();

  database.transaction((transaction) => {
    for (const row of rows) {
      const exclusionReasons = normalizePersistedExclusionReasons(row.exclusionReasons);
      transaction
        .update(jobMatches)
        .set({ exclusionReasons, ...screeningCountColumns(exclusionReasons) })
        .where(eq(jobMatches.id, row.id))
        .run();
    }
  });

  return rows.length;
}

export function backfillScreeningCountColumns(database: Database): number {
  return database.run(sql`
    UPDATE ${jobMatches} AS match
    SET (
      excluded_title_reason_count,
      excluded_location_reason_count,
      stale_reason_count,
      unverified_reason_count,
      context_reason_count,
      salary_reason_count
    ) = (
      SELECT
        coalesce(sum(code IN ('title-mismatch', 'excluded-title')), 0),
        coalesce(sum(code IN ('location-mismatch', 'excluded-location')), 0),
        coalesce(sum(code = 'stale-listing'), 0),
        coalesce(sum(code = 'unverified-lead'), 0),
        coalesce(sum(code = 'missing-required-job-term'), 0),
        coalesce(sum(code IN ('salary-above', 'salary-below')), 0)
      FROM (
        SELECT json_extract(reason.value, '$.code') AS code
        FROM json_each(
          CASE
            WHEN json_valid(match.exclusion_reasons) THEN match.exclusion_reasons
            ELSE '[]'
          END
        ) AS reason
      )
    )
    WHERE match.excluded_title_reason_count IS NULL
  `).changes;
}

export function normalizePersistedExclusionReasons(value: unknown): readonly ExclusionReason[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((reason): ExclusionReason[] => {
    if (isTypedReason(reason)) {
      return [reason];
    }
    return typeof reason === "string" ? [legacyReasonFrom(reason)] : [];
  });
}

function legacyReasonFrom(reason: string): ExclusionReason {
  if (reason === "Web-search lead is not verified by an ATS feed") {
    return { code: "unverified-lead" };
  }
  if (reason === "Missing a required job keyword") {
    return { code: "missing-required-job-term" };
  }
  if (reason === "Title does not match a target role") {
    return { code: "title-mismatch" };
  }
  if (reason === "Location does not match the profile") {
    return { code: "location-mismatch" };
  }
  const prefixedReason = prefixValue(reason);
  if (prefixedReason?.prefix === "Excluded title term: ") {
    return { code: "excluded-title", term: prefixedReason.value };
  }
  if (prefixedReason?.prefix === "Excluded description term: ") {
    return { code: "excluded-description", term: prefixedReason.value };
  }
  if (prefixedReason?.prefix === "Excluded location term: ") {
    return { code: "excluded-location", term: prefixedReason.value };
  }
  const stale = reason.match(/^Posted more than (\d+) days ago$/);
  if (stale) {
    return { code: "stale-listing", maximumAgeDays: Number(stale[1]) };
  }
  const score = reason.match(/^Score is below (\d+)$/);
  if (score) {
    return { code: "score-below", minimumScore: Number(score[1]) };
  }
  const salary = reason.match(/^Salary ([A-Z]{3}) (.+) is (below|above) the preferred range$/);
  if (salary) {
    const range = parseSalary(salary[1] ?? "", salary[2] ?? "");
    if (range) {
      return salary[3] === "below"
        ? { code: "salary-below", salary: range }
        : { code: "salary-above", salary: range };
    }
  }
  return { code: "legacy", detail: reason };
}

function prefixValue(reason: string) {
  const prefixes = [
    "Excluded title term: ",
    "Excluded description term: ",
    "Excluded location term: ",
  ] as const;
  const prefix = prefixes.find((candidate) => reason.startsWith(candidate));
  return prefix ? { prefix, value: reason.slice(prefix.length) } : null;
}

function parseSalary(currency: string, amount: string) {
  const normalized = amount.replaceAll(",", "");
  if (normalized.startsWith("up to ")) {
    return createAnnualSalaryRange(currency, null, numericAmount(normalized.slice(6)));
  }
  if (normalized.endsWith("+")) {
    return createAnnualSalaryRange(currency, numericAmount(normalized.slice(0, -1)), null);
  }
  const [minimum, maximum] = normalized.split("-", 2);
  return createAnnualSalaryRange(
    currency,
    numericAmount(minimum ?? ""),
    numericAmount(maximum ?? minimum ?? ""),
  );
}

function numericAmount(value: string): number | null {
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function isTypedReason(reason: unknown): reason is ExclusionReason {
  return Boolean(
    reason && typeof reason === "object" && "code" in reason && typeof reason.code === "string",
  );
}
