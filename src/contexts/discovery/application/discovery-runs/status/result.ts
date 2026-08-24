export interface DiscoveryRunStatusDto {
  readonly id: number;
  readonly profileId: number;
  readonly profileName: string;
  readonly provider: string;
  readonly status: "running" | "completed" | "failed";
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
