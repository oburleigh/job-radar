import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { and, eq, ne } from "drizzle-orm";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type {
  AtsType,
  BoardInput,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  companyBoards,
  jobs,
  searchProfiles,
} from "@/contexts/discovery/infrastructure/sqlite/schema";

import { fetchBoardJobs } from "../job-sources/connectors";
import { makeDedupeKey } from "../job-sources/urls";
import { evaluateAndStore } from "./store-matches";

export interface SyncResult {
  boardId: number;
  created: number;
  updated: number;
  error: string;
}

export async function syncBoard(board: BoardInput, requestedLimit?: number): Promise<SyncResult> {
  const discovery = getJobRadarConfig().discovery;
  const limit = requestedLimit ?? discovery.boardJobLimit;
  let created = 0;
  let updated = 0;

  try {
    const rawJobs = await fetchBoardJobs(board, { limit });
    for (const [index, rawJob] of rawJobs.entries()) {
      const result = upsertRawJob(board, rawJob);
      created += Number(result === "created");
      updated += Number(result === "updated");
      if ((index + 1) % discovery.workYieldBatchSize === 0) {
        await yieldToEventLoop();
      }
    }

    db.update(companyBoards)
      .set({ lastSyncedAt: new Date(), lastError: "" })
      .where(eq(companyBoards.id, board.id))
      .run();

    return { boardId: board.id, created, updated, error: "" };
  } catch (error) {
    const message = errorMessage(error);
    db.update(companyBoards)
      .set({ lastSyncedAt: new Date(), lastError: message })
      .where(eq(companyBoards.id, board.id))
      .run();
    return { boardId: board.id, created, updated, error: message };
  }
}

export async function syncEnabledBoards(
  atsType?: AtsType,
  requestedLimit?: number,
): Promise<SyncResult[]> {
  const limit = requestedLimit ?? getJobRadarConfig().discovery.boardJobLimit;
  const rows = db
    .select()
    .from(companyBoards)
    .where(eq(companyBoards.enabled, true))
    .all()
    .filter((board) => !atsType || board.atsType === atsType);

  const results: SyncResult[] = [];
  for (const board of rows) {
    results.push(await syncBoard(board, limit));
  }

  const profiles = db.select().from(searchProfiles).where(eq(searchProfiles.enabled, true)).all();
  for (const profile of profiles) {
    await evaluateAndStore(profile);
  }

  return results;
}

function upsertRawJob(board: BoardInput, rawJob: RawJob): "created" | "updated" {
  const dedupeKey = makeDedupeKey(
    rawJob.atsType,
    rawJob.canonicalUrl,
    rawJob.externalId,
    board.canonicalKey,
  );
  const existing = db.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get();
  const now = new Date();

  db.insert(jobs)
    .values({
      boardId: board.id,
      atsType: rawJob.atsType,
      externalId: rawJob.externalId,
      dedupeKey,
      canonicalUrl: rawJob.canonicalUrl,
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
        boardId: board.id,
        externalId: rawJob.externalId,
        canonicalUrl: rawJob.canonicalUrl,
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

  const stored = db.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get();
  if (stored && rawJob.externalId) {
    db.update(jobs)
      .set({ isActive: false })
      .where(
        and(
          eq(jobs.atsType, rawJob.atsType),
          eq(jobs.boardId, board.id),
          eq(jobs.externalId, rawJob.externalId),
          ne(jobs.id, stored.id),
        ),
      )
      .run();
  }

  return existing ? "updated" : "created";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
