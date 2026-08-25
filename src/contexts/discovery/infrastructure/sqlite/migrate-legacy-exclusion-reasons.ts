import { eq, sql } from "drizzle-orm";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import type { ExclusionReason } from "@/contexts/discovery/domain/job-match";

import type { db } from "./database";
import { jobMatches } from "./schema";

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
      transaction
        .update(jobMatches)
        .set({ exclusionReasons: normalizePersistedExclusionReasons(row.exclusionReasons) })
        .where(eq(jobMatches.id, row.id))
        .run();
    }
  });

  return rows.length;
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
