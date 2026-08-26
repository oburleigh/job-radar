import { and, eq, isNull } from "drizzle-orm";

import { isVerifiedJobListing } from "@/contexts/discovery/domain/job-listing-provenance";
import { extractAnnualSalaryFromText } from "@/contexts/discovery/infrastructure/job-sources/annual-salary-parser";
import type {
  AtsType,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { normalizeSearchResult } from "@/contexts/discovery/infrastructure/job-sources/search-result";
import type { StructuredJobPageLookup } from "@/contexts/discovery/infrastructure/job-sources/structured-job-page";
import {
  canonicalizeUrl,
  makeDedupeKey,
} from "@/contexts/discovery/infrastructure/job-sources/urls";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { companyBoards, jobs } from "@/contexts/discovery/infrastructure/sqlite/schema";

type Database = typeof db;

export interface SearchResultInput {
  atsType: AtsType;
  canonicalUrl: string;
  externalId: string;
  boardId: number | null;
  boardKey: string;
  title: string;
  snippet: string;
  locationHint?: string;
}

export function upsertSearchResult(input: SearchResultInput, database: Database = db): number {
  const dedupeKey = makeDedupeKey(
    input.atsType,
    input.canonicalUrl,
    input.externalId,
    input.boardKey,
  );
  let existing = database.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get();
  const identityMatches = input.externalId
    ? database
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.atsType, input.atsType),
            eq(jobs.externalId, input.externalId),
            input.boardId ? eq(jobs.boardId, input.boardId) : isNull(jobs.boardId),
          ),
        )
        .all()
    : [];
  const structuredMatch = identityMatches.find((job) => isVerifiedJobListing(job.evidence));
  if (structuredMatch) {
    if (existing && existing.id !== structuredMatch.id) {
      database.update(jobs).set({ isActive: false }).where(eq(jobs.id, existing.id)).run();
    }
    database
      .update(jobs)
      .set({ lastSeenAt: new Date(), isActive: true })
      .where(eq(jobs.id, structuredMatch.id))
      .run();
    return 1;
  }
  if (!existing) {
    const identityMatch = identityMatches[0];
    if (identityMatch) {
      database.update(jobs).set({ dedupeKey }).where(eq(jobs.id, identityMatch.id)).run();
      existing = { ...identityMatch, dedupeKey };
    }
  }
  const board = input.boardId
    ? database
        .select({
          companyName: companyBoards.companyName,
          slug: companyBoards.slug,
        })
        .from(companyBoards)
        .where(eq(companyBoards.id, input.boardId))
        .get()
    : null;
  const normalized = normalizeSearchResult(input.atsType, input.title, input.snippet);
  const now = new Date();

  if (existing) {
    const hasStructuredEvidence = isVerifiedJobListing(existing.evidence);
    const publishedSalary = extractAnnualSalaryFromText(normalized.description);
    database
      .update(jobs)
      .set({
        boardId: input.boardId ?? existing.boardId,
        companyName: hasStructuredEvidence
          ? existing.companyName
          : normalized.companyName ||
            existing.companyName ||
            board?.companyName ||
            board?.slug ||
            "",
        title: hasStructuredEvidence
          ? existing.title
          : normalized.title.slice(0, 500) || input.externalId || "Untitled job",
        locationText: hasStructuredEvidence
          ? existing.locationText
          : (normalized.locationText || input.locationHint || "").slice(0, 500),
        description: hasStructuredEvidence ? existing.description : normalized.description,
        salaryCurrency: hasStructuredEvidence
          ? existing.salaryCurrency
          : (publishedSalary?.currency ?? ""),
        salaryMin: hasStructuredEvidence ? existing.salaryMin : (publishedSalary?.min ?? null),
        salaryMax: hasStructuredEvidence ? existing.salaryMax : (publishedSalary?.max ?? null),
        lastSeenAt: now,
        isActive: true,
      })
      .where(eq(jobs.id, existing.id))
      .run();
    return 1;
  }

  const publishedSalary = extractAnnualSalaryFromText(normalized.description);
  database
    .insert(jobs)
    .values({
      boardId: input.boardId,
      atsType: input.atsType,
      externalId: input.externalId,
      dedupeKey,
      canonicalUrl: canonicalizeUrl(input.canonicalUrl),
      companyName: normalized.companyName || board?.companyName || board?.slug || "",
      title: normalized.title.slice(0, 500) || input.externalId || "Untitled job",
      locationText: (normalized.locationText || input.locationHint || "").slice(0, 500),
      locations:
        normalized.locationText || input.locationHint
          ? [normalized.locationText || input.locationHint || ""]
          : [],
      description: normalized.description,
      salaryCurrency: publishedSalary?.currency ?? "",
      salaryMin: publishedSalary?.min ?? null,
      salaryMax: publishedSalary?.max ?? null,
      evidence: "search-lead",
      firstSeenAt: now,
      lastSeenAt: now,
      isActive: true,
      rawPayload: {},
    })
    .run();

  return 1;
}

export function upsertVerifiedSearchJob(rawJob: RawJob, database: Database = db): number {
  const dedupeKey = makeDedupeKey(rawJob.atsType, rawJob.canonicalUrl, rawJob.externalId);
  const now = new Date();

  database
    .insert(jobs)
    .values({
      boardId: null,
      atsType: rawJob.atsType,
      externalId: rawJob.externalId,
      dedupeKey,
      canonicalUrl: canonicalizeUrl(rawJob.canonicalUrl),
      applyUrl: rawJob.applyUrl,
      companyName: rawJob.companyName,
      title: rawJob.title,
      locationText: rawJob.locations.join("; "),
      locations: rawJob.locations,
      description: rawJob.description,
      department: rawJob.department,
      employmentType: rawJob.employmentType,
      workplaceType: rawJob.workplaceType,
      publishedAt: rawJob.publishedAt,
      salaryCurrency: rawJob.publishedSalary?.currency ?? "",
      salaryMin: rawJob.publishedSalary?.min ?? null,
      salaryMax: rawJob.publishedSalary?.max ?? null,
      evidence: rawJob.evidence,
      firstSeenAt: now,
      lastSeenAt: now,
      isActive: true,
      rawPayload: rawJob.rawPayload,
    })
    .onConflictDoUpdate({
      target: jobs.dedupeKey,
      set: {
        canonicalUrl: canonicalizeUrl(rawJob.canonicalUrl),
        applyUrl: rawJob.applyUrl,
        companyName: rawJob.companyName,
        title: rawJob.title,
        locationText: rawJob.locations.join("; "),
        locations: rawJob.locations,
        description: rawJob.description,
        department: rawJob.department,
        employmentType: rawJob.employmentType,
        workplaceType: rawJob.workplaceType,
        publishedAt: rawJob.publishedAt,
        salaryCurrency: rawJob.publishedSalary?.currency ?? "",
        salaryMin: rawJob.publishedSalary?.min ?? null,
        salaryMax: rawJob.publishedSalary?.max ?? null,
        evidence: rawJob.evidence,
        lastSeenAt: now,
        isActive: true,
        rawPayload: rawJob.rawPayload,
      },
    })
    .run();

  return 1;
}

export function deactivateSearchJob(
  atsType: AtsType,
  externalId: string,
  database: Database = db,
): void {
  database
    .update(jobs)
    .set({ isActive: false, lastSeenAt: new Date() })
    .where(and(eq(jobs.atsType, atsType), eq(jobs.externalId, externalId)))
    .run();
}

export function recordStructuredJobPageOutcome(
  atsType: AtsType,
  externalId: string,
  outcome: Exclude<StructuredJobPageLookup, { status: "verified" }>,
  checkedAt: Date,
  database: Database = db,
): void {
  const matchingJobs = database
    .select({ id: jobs.id, isActive: jobs.isActive, rawPayload: jobs.rawPayload })
    .from(jobs)
    .where(and(eq(jobs.atsType, atsType), eq(jobs.externalId, externalId)))
    .all();
  const remainsActive = outcome.status === "unavailable";

  for (const job of matchingJobs) {
    database
      .update(jobs)
      .set({
        isActive: remainsActive ? job.isActive : false,
        lastSeenAt: checkedAt,
        rawPayload: {
          ...job.rawPayload,
          verification: {
            status: outcome.status,
            reason: outcome.reason,
            checkedAt: checkedAt.toISOString(),
          },
        },
      })
      .where(eq(jobs.id, job.id))
      .run();
  }
}

export function recordAtsPostingOutcome(
  atsType: AtsType,
  externalId: string,
  boardId: number | null,
  outcome: {
    readonly status: "closed" | "not_found" | "protected" | "transient_failure";
    readonly reason: string;
  },
  checkedAt: Date,
  database: Database = db,
): void {
  const matchingJobs = database
    .select({ id: jobs.id, isActive: jobs.isActive, rawPayload: jobs.rawPayload })
    .from(jobs)
    .where(
      and(
        eq(jobs.atsType, atsType),
        eq(jobs.externalId, externalId),
        boardId === null ? isNull(jobs.boardId) : eq(jobs.boardId, boardId),
      ),
    )
    .all();
  const remainsActive = outcome.status === "protected" || outcome.status === "transient_failure";

  for (const job of matchingJobs) {
    database
      .update(jobs)
      .set({
        isActive: remainsActive ? job.isActive : false,
        lastSeenAt: checkedAt,
        rawPayload: {
          ...job.rawPayload,
          verification: {
            status: outcome.status,
            reason: outcome.reason,
            checkedAt: checkedAt.toISOString(),
          },
        },
      })
      .where(eq(jobs.id, job.id))
      .run();
  }
}
