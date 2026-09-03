export const STALE_DISCOVERY_RUN_CODE = "stale-run";

export type DiscoveryRunStatus = "running" | "completed" | "failed" | "cancelled";

export type DiscoveryRunProgressEvidence = {
  readonly status: DiscoveryRunStatus;
  readonly error: string;
  readonly startedAt: Date;
  readonly heartbeatAt: Date | null;
};

export type StaleDiscoveryRunPolicy = {
  readonly now: Date;
  readonly staleAfterMs: number;
};

export type DiscoveryRunProgress = {
  readonly status: DiscoveryRunStatus;
  readonly error: string;
};

export function resolveDiscoveryRunProgress(
  evidence: DiscoveryRunProgressEvidence,
  policy: StaleDiscoveryRunPolicy,
): DiscoveryRunProgress {
  if (evidence.status !== "running") {
    return { status: evidence.status, error: evidence.error };
  }

  const lastProgressAt = evidence.heartbeatAt ?? evidence.startedAt;
  const cutoff = policy.now.getTime() - policy.staleAfterMs;
  return lastProgressAt.getTime() < cutoff
    ? { status: "failed", error: STALE_DISCOVERY_RUN_CODE }
    : { status: "running", error: evidence.error };
}
