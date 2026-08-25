import { Button, IconButton } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";

import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";
import { formatDiscoveryFailure } from "@/contexts/discovery/presentation/web/formatters/discovery-failure";

const PENDING_RUNS_KEY = "job-radar.pending-discovery-runs";

export interface DiscoveryRunStatus {
  id: number;
  profileId: number;
  profileName: string;
  provider: string;
  status: "running" | "completed" | "failed" | "cancelled";
  hitCount: number;
  jobsUpserted: number;
  matchesFound: number;
  queryErrorCount: number;
  syncErrorCount: number;
  errorSummary: string;
}

interface StatusResponse {
  runs: DiscoveryRunStatus[];
  missingIds: number[];
}

interface DiscoveryNotificationsProps {
  pollIntervalMs: number;
}

export function DiscoveryNotifications({ pollIntervalMs }: DiscoveryNotificationsProps) {
  const revalidator = useRevalidator();
  const pendingIds = useRef(new Set<number>());
  const suppressedIds = useRef(new Set<number>());
  const polling = useRef(false);
  const [runningRuns, setRunningRuns] = useState<DiscoveryRunStatus[]>([]);
  const [notices, setNotices] = useState<DiscoveryRunStatus[]>([]);
  const [cancellingIds, setCancellingIds] = useState<Set<number>>(() => new Set());

  async function cancelRun(run: DiscoveryRunStatus) {
    if (cancellingIds.has(run.id)) {
      return;
    }
    setCancellingIds((current) => new Set(current).add(run.id));
    try {
      const response = await fetch("/api/discovery-runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const result = (await response.json()) as { status?: string };
      if (response.ok && result.status === "cancelled") {
        suppressedIds.current.add(run.id);
        pendingIds.current.delete(run.id);
        persistPendingRuns(pendingIds);
        setRunningRuns((current) => current.filter((item) => item.id !== run.id));
        setNotices((current) =>
          current.some((item) => item.id === run.id)
            ? current
            : [...current, { ...run, status: "cancelled", errorSummary: "Cancelled by user" }],
        );
        void revalidator.revalidate();
      }
    } catch {
      // The next poll will keep the active run visible when the request fails.
    } finally {
      setCancellingIds((current) => {
        const next = new Set(current);
        next.delete(run.id);
        return next;
      });
    }
  }

  useEffect(() => {
    let active = true;

    function trackRun(runId: number) {
      if (!Number.isInteger(runId) || runId < 1 || suppressedIds.current.has(runId)) {
        return;
      }
      pendingIds.current.add(runId);
      persistPendingRuns(pendingIds);
    }

    async function fetchStatuses(url: string): Promise<StatusResponse | null> {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as StatusResponse;
      } catch {
        return null;
      }
    }

    async function adoptActiveRuns() {
      const response = await fetchStatuses("/api/discovery-runs?active=1");
      if (!active || !response) {
        return;
      }
      const activeRuns = response.runs.filter((run) => !suppressedIds.current.has(run.id));
      for (const run of activeRuns) {
        trackRun(run.id);
      }
      setRunningRuns(activeRuns);
    }

    async function pollRuns() {
      if (polling.current || pendingIds.current.size === 0) {
        if (pendingIds.current.size === 0) {
          setRunningRuns([]);
        }
        return;
      }
      polling.current = true;
      const ids = [...pendingIds.current];
      const response = await fetchStatuses(`/api/discovery-runs?ids=${ids.join(",")}`);
      polling.current = false;
      if (!active || !response) {
        return;
      }

      for (const missingId of response.missingIds) {
        pendingIds.current.delete(missingId);
        suppressedIds.current.add(missingId);
      }
      const currentRuns = filterCurrentDiscoveryRuns(
        response.runs,
        pendingIds.current,
        suppressedIds.current,
      );
      const stillRunning = currentRuns.filter((run) => run.status === "running");
      const finished = currentRuns.filter((run) => run.status !== "running");
      setRunningRuns(stillRunning);
      if (finished.length > 0) {
        for (const run of finished) {
          pendingIds.current.delete(run.id);
          suppressedIds.current.add(run.id);
        }
        setNotices((current) => {
          const known = new Set(current.map((notice) => notice.id));
          return [...current, ...finished.filter((run) => !known.has(run.id))];
        });
        void revalidator.revalidate();
      }
      persistPendingRuns(pendingIds);
    }

    const storedIds = readPendingRuns();
    for (const runId of storedIds) {
      if (!suppressedIds.current.has(runId)) {
        pendingIds.current.add(runId);
      }
    }
    void adoptActiveRuns().then(pollRuns);

    const interval = window.setInterval(pollRuns, pollIntervalMs);
    const handleStarted = (event: Event) => {
      const runId = (event as CustomEvent<{ runId?: number }>).detail?.runId;
      if (runId) {
        trackRun(runId);
        void pollRuns();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PENDING_RUNS_KEY) {
        return;
      }
      reconcilePendingRunIds(
        pendingIds.current,
        parseRunIds(event.newValue),
        suppressedIds.current,
      );
      setRunningRuns((current) =>
        filterCurrentDiscoveryRuns(current, pendingIds.current, suppressedIds.current),
      );
      persistPendingRuns(pendingIds);
      void pollRuns();
    };
    window.addEventListener(DISCOVERY_RUN_STARTED_EVENT, handleStarted);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(DISCOVERY_RUN_STARTED_EVENT, handleStarted);
      window.removeEventListener("storage", handleStorage);
    };
  }, [pollIntervalMs, revalidator]);

  return (
    <aside
      className="discovery-notification-layer"
      aria-label="Discovery status"
      aria-live="polite"
    >
      {runningRuns.map((run) => (
        <div className="discovery-running" key={run.id} role="status">
          <LoaderCircle className="spin" size={18} />
          <div>
            <strong>{run.profileName}</strong>
            <span>
              Discovery #{run.id} is running in the background
              {run.hitCount > 0
                ? ` · ${run.hitCount} result${run.hitCount === 1 ? "" : "s"} found`
                : ""}
            </span>
          </div>
          <Button
            busy={cancellingIds.has(run.id)}
            disabled={cancellingIds.has(run.id)}
            onClick={() => void cancelRun(run)}
            variant="danger"
            aria-label={`Cancel discovery #${run.id}`}
          >
            {cancellingIds.has(run.id) ? "Cancelling…" : `Cancel discovery #${run.id}`}
          </Button>
        </div>
      ))}
      {notices.map((run) => {
        const presentation = describeDiscoveryNotice(run);
        const failed = presentation.kind === "failed";
        const cancelled = presentation.kind === "cancelled";
        const partial = presentation.kind === "partial";
        return (
          <div
            className={`discovery-notice${failed ? " notice-failed" : cancelled ? " notice-cancelled" : partial ? " notice-partial" : ""}`}
            key={run.id}
            role={failed || partial ? "alert" : "status"}
          >
            <span className="discovery-notice-icon">
              {failed || partial ? (
                <CircleAlert size={20} />
              ) : cancelled ? (
                <CircleX size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
            </span>
            <div>
              <strong>{presentation.title}</strong>
              <p>{presentation.message}</p>
              <div className="discovery-notice-links">
                {!failed && !cancelled ? (
                  <Link to={`/?profile=${run.profileId}`}>View results</Link>
                ) : null}
                <Link to="/runs">Run history</Link>
              </div>
            </div>
            <IconButton
              onClick={() =>
                setNotices((current) => current.filter((notice) => notice.id !== run.id))
              }
              label="Dismiss discovery notification"
            >
              <X size={17} />
            </IconButton>
          </div>
        );
      })}
    </aside>
  );
}

function readPendingRuns(): number[] {
  try {
    return parseRunIds(window.localStorage.getItem(PENDING_RUNS_KEY));
  } catch {
    return [];
  }
}

function persistPendingRuns(pendingIds: { readonly current: Set<number> }): void {
  try {
    window.localStorage.setItem(PENDING_RUNS_KEY, JSON.stringify([...pendingIds.current]));
  } catch {
    // Polling still works when storage is unavailable in a restricted browser.
  }
}

export function describeDiscoveryNotice(run: DiscoveryRunStatus): {
  readonly kind: "completed" | "partial" | "failed" | "cancelled";
  readonly title: string;
  readonly message: string;
} {
  if (run.status === "failed") {
    return {
      kind: "failed",
      title: "Discovery failed",
      message: formatDiscoveryFailure(run),
    };
  }
  if (run.status === "cancelled") {
    return {
      kind: "cancelled",
      title: "Discovery cancelled",
      message: `${run.profileName}: Discovery #${run.id} was cancelled after processing ${run.hitCount} search result${run.hitCount === 1 ? "" : "s"}.`,
    };
  }
  if (run.queryErrorCount + run.syncErrorCount > 0) {
    const partialFailure = run.errorSummary.trim()
      ? formatDiscoveryFailure(run)
      : `${run.profileName} completed with ${[
          run.queryErrorCount > 0
            ? `${run.queryErrorCount} search error${run.queryErrorCount === 1 ? "" : "s"}`
            : "",
          run.syncErrorCount > 0
            ? `${run.syncErrorCount} board synchronization error${run.syncErrorCount === 1 ? "" : "s"}`
            : "",
        ]
          .filter(Boolean)
          .join(" and ")}.`;
    return {
      kind: "partial",
      title: "Discovery partially completed",
      message: `${partialFailure} ${run.matchesFound} current profile match${run.matchesFound === 1 ? " was" : "es were"} retained.`,
    };
  }
  return {
    kind: "completed",
    title: "Discovery completed",
    message: `${run.profileName}: ${run.matchesFound} current profile match${run.matchesFound === 1 ? "" : "es"} after processing ${run.hitCount} search result${run.hitCount === 1 ? "" : "s"}.`,
  };
}

export function reconcilePendingRunIds(
  pendingIds: Set<number>,
  incomingIds: readonly number[],
  suppressedIds: Set<number>,
): void {
  const incoming = new Set(incomingIds);
  for (const runId of pendingIds) {
    if (!incoming.has(runId)) {
      pendingIds.delete(runId);
      suppressedIds.add(runId);
    }
  }
  for (const runId of incoming) {
    suppressedIds.delete(runId);
    pendingIds.add(runId);
  }
}

export function filterCurrentDiscoveryRuns<Run extends { readonly id: number }>(
  runs: readonly Run[],
  pendingIds: ReadonlySet<number>,
  suppressedIds: ReadonlySet<number>,
): Run[] {
  return runs.filter((run) => pendingIds.has(run.id) && !suppressedIds.has(run.id));
}

function parseRunIds(value: string | null): number[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => Number.isInteger(item) && Number(item) > 0)
      : [];
  } catch {
    return [];
  }
}
