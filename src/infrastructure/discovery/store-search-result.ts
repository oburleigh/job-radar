import { and, eq, isNull } from "drizzle-orm";

import type {
  AtsType,
  RawJob,
} from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { companyBoards, jobs } from "@/contexts/discovery/adapters/driven/sqlite/schema";

import { normalizeSearchResult } from "./search-result";
import { canonicalizeUrl, makeDedupeKey } from "./urls";

interface SearchResultInput {
  atsType: AtsType;
  canonicalUrl: string;
  externalId: string;
  boardId: number | null;
  boardKey: string;
  title: string;
  snippet: string;
  locationHint?: string;
}

export function upsertSearchResult(input: SearchResultInput): number {
  const dedupeKey = makeDedupeKey(
    input.atsType,
    input.canonicalUrl,
    input.externalId,
    input.boardKey,
  );
  let existing = db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get();
  const identityMatches = input.externalId
    ? db
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
  const structuredMatch = identityMatches.find((job) => Object.keys(job.rawPayload).length > 0);
  if (structuredMatch) {
    if (existing && existing.id !== structuredMatch.id) {
      db.update(jobs).set({ isActive: false }).where(eq(jobs.id, existing.id)).run();
    }
    db.update(jobs)
      .set({ lastSeenAt: new Date(), isActive: true })
      .where(eq(jobs.id, structuredMatch.id))
      .run();
    return 1;
  }
  if (!existing) {
    const identityMatch = identityMatches[0];
    if (identityMatch) {
      db.update(jobs).set({ dedupeKey }).where(eq(jobs.id, identityMatch.id)).run();
      existing = { ...identityMatch, dedupeKey };
    }
  }
  const board = input.boardId
    ? db
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
    const hasStructuredPayload = Object.keys(existing.rawPayload).length > 0;
    db.update(jobs)
      .set({
        boardId: input.boardId ?? existing.boardId,
        companyName: hasStructuredPayload
          ? existing.companyName
          : normalized.companyName ||
            existing.companyName ||
            board?.companyName ||
            board?.slug ||
            "",
        title: hasStructuredPayload
          ? existing.title
          : normalized.title.slice(0, 500) || input.externalId || "Untitled job",
        locationText: hasStructuredPayload
          ? existing.locationText
          : (normalized.locationText || input.locationHint || "").slice(0, 500),
        description: hasStructuredPayload ? existing.description : normalized.description,
        lastSeenAt: now,
        isActive: true,
      })
      .where(eq(jobs.id, existing.id))
      .run();
    return 1;
  }

  db.insert(jobs)
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
      firstSeenAt: now,
      lastSeenAt: now,
      isActive: true,
      rawPayload: {},
    })
    .run();

  return 1;
}

export function upsertVerifiedSearchJob(rawJob: RawJob): number {
  const dedupeKey = makeDedupeKey(rawJob.atsType, rawJob.canonicalUrl, rawJob.externalId);
  const now = new Date();

  db.insert(jobs)
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
        lastSeenAt: now,
        isActive: true,
        rawPayload: rawJob.rawPayload,
      },
    })
    .run();

  return 1;
}

export function deactivateSearchJob(atsType: AtsType, externalId: string): void {
  db.update(jobs)
    .set({ isActive: false, lastSeenAt: new Date() })
    .where(and(eq(jobs.atsType, atsType), eq(jobs.externalId, externalId)))
    .run();
}
