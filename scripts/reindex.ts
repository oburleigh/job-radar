import "dotenv/config";

import { eq } from "drizzle-orm";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { db } from "../src/db/client";
import { companyBoards, discoveryHits, searchProfiles } from "../src/db/schema";
import { evaluateAndStore } from "../src/lib/discovery/store-matches";
import { upsertSearchResult } from "../src/lib/discovery/store-search-result";
import { classifyUrl } from "../src/lib/discovery/urls";

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
    if ((index + 1) % 25 === 0) {
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
