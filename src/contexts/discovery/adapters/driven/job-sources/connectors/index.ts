import { getJobRadarConfig } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import type {
  BoardInput,
  RawJob,
} from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";

import { fetchAshby } from "./ashby";
import { fetchBambooHr } from "./bamboohr";
import { fetchGreenhouse } from "./greenhouse";
import { fetchJobvite } from "./jobvite";
import { fetchLever } from "./lever";
import type { BoardConnector } from "./shared";
import { fetchSmartRecruiters } from "./smartrecruiters";
import { fetchWorkable } from "./workable";
import { fetchWorkday } from "./workday";

interface FetchOptions {
  readonly limit?: number;
  readonly fetcher?: typeof fetch;
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
  const connector = connectors[board.atsType];
  if (!connector) {
    throw new Error(
      board.atsType === "icims" || board.atsType === "linkedin"
        ? `${board.atsType} does not support direct board sync`
        : `${board.atsType} does not have a direct board connector`,
    );
  }

  return connector(
    board,
    options.limit ?? getJobRadarConfig().discovery.boardJobLimit,
    options.fetcher ?? fetch,
  );
}
