import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type {
  BoardInput,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

import { fetchAshby } from "./ashby";
import { fetchBambooHr } from "./bamboohr";
import { fetchGreenhouse } from "./greenhouse";
import { fetchJobvite } from "./jobvite";
import { fetchLever } from "./lever";
import type { RejectedVendorRecord } from "./response-schema";
import type { BoardConnector } from "./shared";
import { fetchSmartRecruiters } from "./smartrecruiters";
import { fetchWorkable } from "./workable";
import { fetchWorkday } from "./workday";

export { formatRejectedVendorRecords, type RejectedVendorRecord } from "./response-schema";

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

const connectors: Readonly<Record<string, BoardConnector>> = {
  ashby: fetchAshby,
  bamboohr: fetchBambooHr,
  greenhouse: fetchGreenhouse,
  jobvite: fetchJobvite,
  lever: fetchLever,
  smartrecruiters: fetchSmartRecruiters,
  workable: fetchWorkable,
  workday: fetchWorkday,
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
  const connector = connectors[board.atsType];
  if (!connector) {
    throw new Error(
      board.atsType === "icims" || board.atsType === "linkedin"
        ? `${board.atsType} does not support direct board sync`
        : `${board.atsType} does not have a direct board connector`,
    );
  }

  const rejectedRecords: RejectedVendorRecord[] = [];
  const jobs = await connector(
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
