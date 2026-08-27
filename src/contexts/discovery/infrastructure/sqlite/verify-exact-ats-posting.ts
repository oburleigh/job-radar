import { and, eq, isNotNull } from "drizzle-orm";
import {
  lookupAtsPosting,
  supportsAtsPostingLookup,
} from "@/contexts/discovery/infrastructure/job-sources/adapters";
import type { ClassifiedUrl } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type { db } from "./database";
import { companyBoards, discoveryHits, jobs } from "./schema";
import {
  recordAtsPostingOutcome,
  type SearchResultInput,
  upsertSearchResult,
} from "./store-search-result";
import { upsertBoardJob } from "./sync-boards";

type Database = typeof db;

interface ExactAtsPostingInput {
  readonly database: Database;
  readonly classification: ClassifiedUrl;
  readonly discoveredBoardId: number | undefined;
  readonly searchResult: SearchResultInput;
  readonly runId: number;
  readonly hitUrl: string;
  readonly checkedAt: Date;
  readonly lookupPosting?: typeof lookupAtsPosting;
}

export interface ExactAtsHitOutcome {
  readonly boardId: number | null;
  readonly status: "verified" | "closed" | "not_found" | "protected" | "transient_failure";
  readonly reason: string;
  readonly checkedUrl: string;
  readonly checkedAt: Date;
}

interface ExactAtsPostingVerification {
  readonly jobsWritten: number;
  readonly outcome: ExactAtsHitOutcome;
}

export async function verifyExactAtsPosting(
  input: ExactAtsPostingInput,
): Promise<ExactAtsPostingVerification | null> {
  const shouldLookup = Boolean(
    input.classification.externalId && supportsAtsPostingLookup(input.classification.atsType),
  );
  if (!shouldLookup) {
    return null;
  }

  const board = resolvePostingBoard(
    input.database,
    input.classification.atsType,
    input.classification.externalId,
    input.discoveredBoardId,
  );
  if (!board) {
    const jobsWritten = upsertSearchResult(input.searchResult, input.database);
    const outcome: ExactAtsHitOutcome = {
      boardId: null,
      status: "transient_failure",
      reason: "board-unresolved",
      checkedUrl: input.classification.canonicalUrl,
      checkedAt: input.checkedAt,
    };
    recordAtsPostingOutcome(
      input.classification.atsType,
      input.classification.externalId,
      null,
      { status: "transient_failure", reason: "board-unresolved" },
      input.checkedAt,
      input.database,
    );
    recordExactAtsHitOutcome(input.database, {
      runId: input.runId,
      url: input.hitUrl,
      ...outcome,
    });
    return { jobsWritten, outcome };
  }

  const hadKnownPosting = hasKnownPosting(
    input.database,
    input.classification.atsType,
    input.classification.externalId,
    board.id,
  );
  const lookup = await (input.lookupPosting ?? lookupAtsPosting)(
    board,
    input.classification.externalId,
  );
  if (lookup.status === "verified") {
    upsertBoardJob(board, lookup.job, input.database);
    const outcome: ExactAtsHitOutcome = {
      boardId: board.id,
      status: "verified",
      reason: "",
      checkedUrl: lookup.job.canonicalUrl,
      checkedAt: input.checkedAt,
    };
    recordExactAtsHitOutcome(input.database, {
      runId: input.runId,
      url: input.hitUrl,
      ...outcome,
    });
    return { jobsWritten: 1, outcome };
  }

  const status = lookup.status === "not_found" && hadKnownPosting ? "closed" : lookup.status;
  const jobsWritten = upsertSearchResult(
    {
      ...input.searchResult,
      boardId: board.id,
      boardKey: board.canonicalKey,
    },
    input.database,
  );
  recordAtsPostingOutcome(
    input.classification.atsType,
    input.classification.externalId,
    board.id,
    { status, reason: lookup.reason },
    input.checkedAt,
    input.database,
  );
  const outcome: ExactAtsHitOutcome = {
    boardId: board.id,
    status,
    reason: lookup.reason,
    checkedUrl: lookup.checkedUrl,
    checkedAt: input.checkedAt,
  };
  recordExactAtsHitOutcome(input.database, {
    runId: input.runId,
    url: input.hitUrl,
    ...outcome,
  });
  return { jobsWritten, outcome };
}

function hasKnownPosting(
  database: Database,
  atsType: string,
  externalId: string,
  boardId: number,
): boolean {
  return (
    database
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.atsType, atsType),
          eq(jobs.externalId, externalId),
          eq(jobs.boardId, boardId),
          eq(jobs.evidence, "structured"),
        ),
      )
      .get() !== undefined
  );
}

function resolvePostingBoard(
  database: Database,
  atsType: string,
  externalId: string,
  discoveredBoardId: number | undefined,
): typeof companyBoards.$inferSelect | null {
  const resolvedBoardId =
    discoveredBoardId ??
    database
      .select({ boardId: jobs.boardId })
      .from(jobs)
      .where(
        and(eq(jobs.atsType, atsType), eq(jobs.externalId, externalId), isNotNull(jobs.boardId)),
      )
      .all()
      .find((row) => row.boardId !== null)?.boardId;
  if (resolvedBoardId === undefined || resolvedBoardId === null) {
    return null;
  }
  return (
    database.select().from(companyBoards).where(eq(companyBoards.id, resolvedBoardId)).get() ?? null
  );
}

export function recordExactAtsHitOutcome(
  database: Database,
  input: ExactAtsHitOutcome & { readonly runId: number; readonly url: string },
): void {
  database
    .update(discoveryHits)
    .set({
      boardId: input.boardId,
      verificationStatus: input.status,
      verificationReason: input.reason,
      verificationUrl: input.checkedUrl,
      verificationCheckedAt: input.checkedAt,
    })
    .where(and(eq(discoveryHits.runId, input.runId), eq(discoveryHits.url, input.url)))
    .run();
}
