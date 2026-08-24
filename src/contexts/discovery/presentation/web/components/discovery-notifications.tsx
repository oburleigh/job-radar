import { IconButton } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";

import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";
import { formatDiscoveryFailure } from "@/contexts/discovery/presentation/web/formatters/discovery-failure";

const PENDING_RUNS_KEY = "job-radar.pending-discovery-runs";

interface DiscoveryRunStatus {
  id: number;
  profileId: number;
  profileName: string;
  provider: string;
  status: "running" | "completed" | "failed";
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
  const polling = useRef(false);
  const [runningRuns, setRunningRuns] = useState<DiscoveryRunStatus[]>([]);
  const [notices, setNotices] = useState<DiscoveryRunStatus[]>([]);

  useEffect(() => {
    let active = true;

    function persistPendingRuns() {
      try {
        window.localStorage.setItem(PENDING_RUNS_KEY, JSON.stringify([...pendingIds.current]));
      } catch {
        // Polling still works when storage is unavailable in a restricted browser.
      }
    }

    function trackRun(runId: number) {
      if (!Number.isInteger(runId) || runId < 1) {
        return;
      }
      pendingIds.current.add(runId);
      persistPendingRuns();
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
      for (const run of response.runs) {
        trackRun(run.id);
      }
      setRunningRuns(response.runs);
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
      }
      const stillRunning = response.runs.filter((run) => run.status === "running");
      const finished = response.runs.filter((run) => run.status !== "running");
      setRunningRuns(stillRunning);
      if (finished.length > 0) {
        for (const run of finished) {
          pendingIds.current.delete(run.id);
        }
        setNotices((current) => {
          const known = new Set(current.map((notice) => notice.id));
          return [...current, ...finished.filter((run) => !known.has(run.id))];
        });
        void revalidator.revalidate();
      }
      persistPendingRuns();
    }

    const storedIds = readPendingRuns();
    for (const runId of storedIds) {
      pendingIds.current.add(runId);
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
      for (const runId of parseRunIds(event.newValue)) {
        pendingIds.current.add(runId);
      }
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
        </div>
      ))}
      {notices.map((run) => {
        const failed = run.status === "failed";
        const errorCount = run.queryErrorCount + run.syncErrorCount;
        return (
          <div
            className={`discovery-notice${failed ? " notice-failed" : ""}`}
            key={run.id}
            role={failed ? "alert" : "status"}
          >
            <span className="discovery-notice-icon">
              {failed ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}
            </span>
            <div>
              <strong>{failed ? "Discovery failed" : "Discovery completed"}</strong>
              <p>
                {failed
                  ? formatDiscoveryFailure(run)
                  : `${run.profileName}: ${run.matchesFound} current profile match${
                      run.matchesFound === 1 ? "" : "es"
                    } after processing ${run.hitCount} search result${
                      run.hitCount === 1 ? "" : "s"
                    }${
                      errorCount > 0
                        ? `, with ${errorCount} error${errorCount === 1 ? "" : "s"}`
                        : ""
                    }.`}
              </p>
              <div className="discovery-notice-links">
                {!failed ? <Link to={`/?profile=${run.profileId}`}>View results</Link> : null}
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
