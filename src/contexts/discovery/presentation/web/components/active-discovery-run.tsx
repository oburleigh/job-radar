import { Button, buttonAttributes } from "@job-radar/design-ui";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRevalidator } from "react-router";
import type { DiscoveryRunPhase } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";

export interface ActiveDiscoveryRunState {
  readonly id: number;
  readonly profileName: string;
  readonly phase: DiscoveryRunPhase | null;
  readonly knownBoardCount: number | null;
  readonly knownBoardCompletedCount: number | null;
  readonly activeBoardName: string | null;
  readonly jobsUpserted: number;
  readonly matchesFound: number;
}

interface CancellationResponse {
  readonly ok?: boolean;
  readonly message?: string;
}

interface ActiveDiscoveryRunProps {
  readonly run: ActiveDiscoveryRunState;
  readonly showRunLink?: boolean;
}

export function ActiveDiscoveryRun({ run, showRunLink = false }: ActiveDiscoveryRunProps) {
  const revalidator = useRevalidator();
  const [cancelling, setCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState("");

  async function cancelRun() {
    if (cancelling) {
      return;
    }
    setCancelling(true);
    setCancellationError("");
    try {
      const response = await fetch("/api/discovery-runs", {
        method: "delete",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const result = (await response.json().catch(() => null)) as CancellationResponse | null;
      if (!response.ok || result?.ok !== true) {
        setCancellationError(result?.message ?? "Cancellation failed. Try again.");
        return;
      }
      await revalidator.revalidate();
    } catch {
      setCancellationError("Cancellation failed. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="active-discovery-run">
      <div className="active-discovery-run-heading">
        <div>
          <strong>{run.profileName}</strong>
          <p aria-live="polite">{describeDiscoveryProgress(run)}</p>
        </div>
        <span className="run-status run-running">
          <LoaderCircle className="spin" size={15} aria-hidden="true" />
          Running
        </span>
      </div>
      <div className="active-discovery-run-actions">
        {showRunLink ? (
          <Link
            {...buttonAttributes("secondary")}
            to={`/runs/${run.id}`}
            aria-label={`View run #${run.id}`}
          >
            View run
          </Link>
        ) : null}
        <Button
          aria-label={`${cancelling ? "Cancelling…" : "Cancel"} discovery #${run.id}`}
          busy={cancelling}
          disabled={cancelling}
          onClick={() => void cancelRun()}
          variant="danger"
        >
          {cancelling ? "Cancelling…" : "Cancel"}
        </Button>
      </div>
      {cancellationError ? (
        <p className="active-discovery-run-error" role="alert">
          {cancellationError}
        </p>
      ) : null}
    </div>
  );
}

export function ActiveDiscoveryRunPolling({
  enabled,
  pollIntervalMs,
}: {
  readonly enabled: boolean;
  readonly pollIntervalMs: number;
}) {
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!enabled || revalidator.state !== "idle") {
      return;
    }
    const timeout = window.setTimeout(() => {
      void revalidator.revalidate();
    }, pollIntervalMs);
    return () => window.clearTimeout(timeout);
  }, [enabled, pollIntervalMs, revalidator]);

  return null;
}

export function describeDiscoveryPhase(
  run: Pick<ActiveDiscoveryRunState, "phase" | "knownBoardCount" | "id">,
): string {
  if (run.phase === "known-boards") {
    return "Refreshing known boards";
  }
  if (run.phase === "web-coverage") {
    return run.knownBoardCount === 0
      ? "No enabled company boards; expanding web coverage"
      : "Expanding web coverage";
  }
  if (run.phase === "matching") {
    return "Matching jobs to profile";
  }
  return `Discovery #${run.id} is running in the background`;
}

export function describeDiscoveryProgress(
  run: Pick<
    ActiveDiscoveryRunState,
    | "phase"
    | "knownBoardCount"
    | "knownBoardCompletedCount"
    | "activeBoardName"
    | "jobsUpserted"
    | "matchesFound"
    | "id"
  >,
): string {
  const details = [
    describeDiscoveryPhase(run),
    `${run.knownBoardCompletedCount ?? 0} of ${run.knownBoardCount ?? 0} boards`,
    run.activeBoardName ? `Active board: ${run.activeBoardName}` : "",
    `${run.jobsUpserted} job${run.jobsUpserted === 1 ? "" : "s"} changed`,
    `${run.matchesFound} match${run.matchesFound === 1 ? "" : "es"} found`,
  ];
  return details.filter(Boolean).join(" · ");
}
