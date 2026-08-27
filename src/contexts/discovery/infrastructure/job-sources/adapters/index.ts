import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type {
  BoardInput,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

import { fetchAshby, lookupAshbyPosting } from "./ashby";
import { fetchBambooHr } from "./bamboohr";
import { fetchGreenhouse, lookupGreenhousePosting } from "./greenhouse";
import { fetchJobvite } from "./jobvite";
import { fetchLever, lookupLeverPosting } from "./lever";
import type { RejectedVendorRecord } from "./response-schema";
import type { BoardAdapter, PostingLookupAdapter } from "./shared";
import { fetchSmartRecruiters } from "./smartrecruiters";
import { fetchWorkable, lookupWorkablePosting } from "./workable";
import { fetchWorkday } from "./workday";

export { formatRejectedVendorRecords, type RejectedVendorRecord } from "./response-schema";
export type { AtsPostingLookup } from "./shared";

interface FetchOptions {
  readonly limit?: number;
  readonly fetcher?: typeof fetch;
}

export interface BoardFetchResult {
  readonly jobs: RawJob[];
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectedRecords: readonly RejectedVendorRecord[];
}

interface AtsAdapter {
  readonly fetchBoard: BoardAdapter;
  readonly lookupPosting?: PostingLookupAdapter;
}

const adapters: Readonly<Record<string, AtsAdapter>> = {
  ashby: { fetchBoard: fetchAshby, lookupPosting: lookupAshbyPosting },
  bamboohr: { fetchBoard: fetchBambooHr },
  greenhouse: { fetchBoard: fetchGreenhouse, lookupPosting: lookupGreenhousePosting },
  jobvite: { fetchBoard: fetchJobvite },
  lever: { fetchBoard: fetchLever, lookupPosting: lookupLeverPosting },
  smartrecruiters: { fetchBoard: fetchSmartRecruiters },
  workable: { fetchBoard: fetchWorkable, lookupPosting: lookupWorkablePosting },
  workday: { fetchBoard: fetchWorkday },
};

export async function fetchBoardJobs(
  board: BoardInput,
  options: FetchOptions = {},
): Promise<RawJob[]> {
  return (await fetchBoardJobsWithDiagnostics(board, options)).jobs;
}

export async function fetchBoardJobsWithDiagnostics(
  board: BoardInput,
  options: FetchOptions = {},
): Promise<BoardFetchResult> {
  const adapter = adapters[board.atsType];
  if (!adapter) {
    throw new Error(
      board.atsType === "icims" || board.atsType === "linkedin"
        ? `${board.atsType} does not support direct board sync`
        : `${board.atsType} does not have a direct board adapter`,
    );
  }

  const rejectedRecords: RejectedVendorRecord[] = [];
  const jobs = await adapter.fetchBoard(
    board,
    options.limit ?? getJobRadarConfig().discovery.boardJobLimit,
    options.fetcher ?? fetch,
    (record) => rejectedRecords.push(record),
  );
  return {
    jobs,
    acceptedCount: jobs.length,
    rejectedCount: rejectedRecords.length,
    rejectedRecords,
  };
}

export async function lookupAtsPosting(
  board: BoardInput,
  externalId: string,
  options: Pick<FetchOptions, "fetcher"> = {},
) {
  const lookupPosting = adapters[board.atsType]?.lookupPosting;
  if (!lookupPosting) {
    throw new Error(`${board.atsType} does not support exact posting lookup`);
  }
  return lookupPosting(board, externalId, options.fetcher ?? fetch);
}

export function supportsAtsPostingLookup(atsType: string): boolean {
  return adapters[atsType]?.lookupPosting !== undefined;
}
