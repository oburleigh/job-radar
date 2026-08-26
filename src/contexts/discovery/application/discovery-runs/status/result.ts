import type { DiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type {
  DiscoveryRunPhase,
  WebCoverageStatus,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";

export interface DiscoveryRunStatusDto {
  readonly id: number;
  readonly profileId: number;
  readonly profileName: string;
  readonly provider: string;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly outcome: DiscoveryRunOutcome;
  readonly phase: DiscoveryRunPhase | null;
  readonly knownBoardCount: number | null;
  readonly knownBoardCompletedCount: number | null;
  readonly knownBoardSuccessCount: number | null;
  readonly activeBoardName: string | null;
  readonly webCoverageStatus: WebCoverageStatus | null;
  readonly hitCount: number;
  readonly jobsUpserted: number;
  readonly matchesFound: number;
  readonly queryErrorCount: number;
  readonly syncErrorCount: number;
  readonly errorSummary: string;
}

export interface DiscoveryRunStatusesDto {
  readonly runs: readonly DiscoveryRunStatusDto[];
  readonly missingIds: readonly number[];
}
