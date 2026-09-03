import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { STALE_DISCOVERY_RUN_CODE } from "@/contexts/discovery/domain/stale-discovery-run";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { discoveryRuns, searchProfiles } from "@/contexts/discovery/infrastructure/sqlite/schema";
import { sqlite } from "@/platform/sqlite/client";

import { loader } from "./discovery-runs";

const seededProfileIds: number[] = [];

describe("discovery run status endpoint", () => {
  afterEach(() => {
    for (const profileId of seededProfileIds.splice(0)) {
      db.delete(discoveryRuns).where(eq(discoveryRuns.profileId, profileId)).run();
      db.delete(searchProfiles).where(eq(searchProfiles.id, profileId)).run();
    }
  });

  /**
   * Three surfaces poll this endpoint every few seconds. It used to reap stale runs from inside
   * the loader, so the answer arrived with an UPDATE attached. Naming the members the loader may
   * call would not prove the write is gone, because the member it calls could perform one; the
   * connection is put in `query_only` instead, which makes any write on the read path throw.
   */
  it("answers the poll with a stale run's outcome while writes are impossible", async () => {
    const runId = seedStaleRun();
    const before = readRun(runId);

    sqlite.pragma("query_only = ON");
    let response: Response;
    try {
      response = await loader({
        request: new Request(`http://127.0.0.1/api/discovery-runs?ids=${runId}`, {
          headers: { host: "127.0.0.1:5173" },
        }),
      } as never);
    } finally {
      sqlite.pragma("query_only = OFF");
    }

    expect(response.status).toBe(200);
    expect(((await response.json()) as { runs: unknown[] }).runs).toEqual([
      expect.objectContaining({
        id: runId,
        status: "failed",
        errorSummary: STALE_DISCOVERY_RUN_CODE,
      }),
    ]);
    expect(readRun(runId)).toEqual(before);
  });

  it("leaves the reap to the next reservation rather than to whoever loads the page", async () => {
    const runId = seedStaleRun();

    await loader({
      request: new Request("http://127.0.0.1/api/discovery-runs?active=1", {
        headers: { host: "127.0.0.1:5173" },
      }),
    } as never);

    expect(readRun(runId)).toMatchObject({ status: "running", error: "" });
  });
});

function seedStaleRun(): number {
  const now = Date.now();
  const profileId = db
    .insert(searchProfiles)
    .values({
      name: `Stale run endpoint ${now}`,
      titleTerms: ["Staff Engineer"],
      locationTerms: ["Remote"],
      excludedTitleTerms: [],
      excludedDescriptionTerms: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .returning({ id: searchProfiles.id })
    .get().id;
  seededProfileIds.push(profileId);
  return db
    .insert(discoveryRuns)
    .values({
      profileId,
      provider: "serper",
      status: "running",
      startedAt: new Date(now - 86_400_000),
      heartbeatAt: new Date(now - 86_400_000),
    })
    .returning({ id: discoveryRuns.id })
    .get().id;
}

function readRun(runId: number) {
  return db.select().from(discoveryRuns).where(eq(discoveryRuns.id, runId)).get();
}
