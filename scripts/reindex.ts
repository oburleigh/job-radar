import "dotenv/config";

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { eq } from "drizzle-orm";

import { getJobRadarConfig } from "../src/contexts/discovery/infrastructure/configuration/job-radar-config";
import { classifyUrl } from "../src/contexts/discovery/infrastructure/job-sources/urls";
import { db } from "../src/contexts/discovery/infrastructure/sqlite/database";
import {
  companyBoards,
  discoveryHits,
  searchProfiles,
} from "../src/contexts/discovery/infrastructure/sqlite/schema";
import { evaluateAndStore } from "../src/contexts/discovery/infrastructure/sqlite/store-matches";
import { upsertSearchResult } from "../src/contexts/discovery/infrastructure/sqlite/store-search-result";

async function main() {
  const boards = new Map(
    db
      .select({
        id: companyBoards.id,
        canonicalKey: companyBoards.canonicalKey,
      })
      .from(companyBoards)
      .all()
      .map((board) => [board.canonicalKey, board.id]),
  );
  const hits = db.select().from(discoveryHits).all();
  const { workYieldBatchSize } = getJobRadarConfig().discovery;
  let reprocessed = 0;

  for (const [index, hit] of hits.entries()) {
    const classified = classifyUrl(hit.url);
    if (!classified) {
      continue;
    }
    const boardId = classified.board ? (boards.get(classified.board.canonicalKey) ?? null) : null;
    upsertSearchResult({
      atsType: classified.atsType,
      canonicalUrl: classified.canonicalUrl,
      externalId: classified.externalId,
      boardId,
      boardKey: classified.board?.canonicalKey ?? "",
      title: hit.title,
      snippet: hit.snippet,
    });
    db.update(discoveryHits)
      .set({ atsType: classified.atsType, boardId })
      .where(eq(discoveryHits.id, hit.id))
      .run();
    reprocessed += 1;
    if ((index + 1) % workYieldBatchSize === 0) {
      await yieldToEventLoop();
    }
  }

  const profiles = db.select().from(searchProfiles).all();
  for (const profile of profiles) {
    await evaluateAndStore(profile);
  }

  console.log(
    `Reprocessed ${reprocessed} discovery hits and evaluated ${profiles.length} profiles.`,
  );
}

void main();
