import { IconButton } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import type { DiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type {
  DiscoveryRunPhase,
  WebCoverageStatus,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";
import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";
import { describeDiscoveryProgress } from "@/contexts/discovery/presentation/web/components/active-discovery-run";
import { formatDiscoveryFailure } from "@/contexts/discovery/presentation/web/formatters/discovery-failure";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";

const PENDING_RUNS_KEY = "job-radar.pending-discovery-runs";

export interface DiscoveryRunStatus {
  id: number;
  profileId: number;
  profileName: string;
  provider: string;
  status: "running" | "completed" | "failed" | "cancelled";
  outcome: DiscoveryRunOutcome;
  phase: DiscoveryRunPhase | null;
  knownBoardCount: number | null;
  knownBoardCompletedCount: number | null;
  knownBoardSuccessCount: number | null;
  activeBoardName: string | null;
  webCoverageStatus: WebCoverageStatus | null;
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
  readonly notificationDurationMs: number;
  readonly pollIntervalMs: number;
}

export function DiscoveryNotifications({
  notificationDurationMs,
  pollIntervalMs,
}: DiscoveryNotificationsProps) {
  const revalidator = useRevalidator();
  const pendingIds = useRef(new Set<number>());
  const suppressedIds = useRef(new Set<number>());
  const hiddenRunningIds = useRef(new Set<number>());
  const autoDismissTimers = useRef(
    new Map<number, { readonly status: DiscoveryRunStatus["status"]; readonly timer: number }>(),
  );
  const polling = useRef(false);
  const [notices, setNotices] = useState<DiscoveryRunStatus[]>([]);

  useEffect(() => {
    let active = true;

    function clearAutoDismiss(runId: number) {
      const scheduled = autoDismissTimers.current.get(runId);
      if (scheduled) {
        window.clearTimeout(scheduled.timer);
        autoDismissTimers.current.delete(runId);
      }
    }

    function showNotice(run: DiscoveryRunStatus) {
      if (run.status === "running" && hiddenRunningIds.current.has(run.id)) {
        return;
      }

      setNotices((current) => {
        const existingIndex = current.findIndex((notice) => notice.id === run.id);
        if (existingIndex === -1) {
          return [...current, run];
        }
        return current.map((notice, index) => (index === existingIndex ? run : notice));
      });

      const scheduled = autoDismissTimers.current.get(run.id);
      if (scheduled?.status === run.status) {
        return;
      }
      clearAutoDismiss(run.id);
      const timer = window.setTimeout(() => {
        autoDismissTimers.current.delete(run.id);
        if (run.status === "running") {
          hiddenRunningIds.current.add(run.id);
        }
        setNotices((current) => current.filter((notice) => notice.id !== run.id));
      }, notificationDurationMs);
      autoDismissTimers.current.set(run.id, { status: run.status, timer });
    }

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
    }

    async function pollRuns() {
      if (polling.current || pendingIds.current.size === 0) {
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
      const finished: DiscoveryRunStatus[] = [];
      for (const run of currentRuns) {
        if (run.status === "running") {
          showNotice(run);
          continue;
        }
        hiddenRunningIds.current.delete(run.id);
        showNotice(run);
        finished.push(run);
      }
      if (finished.length > 0) {
        for (const run of finished) {
          pendingIds.current.delete(run.id);
          suppressedIds.current.add(run.id);
        }
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
        void revalidator.revalidate();
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
      persistPendingRuns(pendingIds);
      void pollRuns();
    };
    window.addEventListener(DISCOVERY_RUN_STARTED_EVENT, handleStarted);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.clearInterval(interval);
      for (const scheduled of autoDismissTimers.current.values()) {
        window.clearTimeout(scheduled.timer);
      }
      autoDismissTimers.current.clear();
      window.removeEventListener(DISCOVERY_RUN_STARTED_EVENT, handleStarted);
      window.removeEventListener("storage", handleStorage);
    };
  }, [notificationDurationMs, pollIntervalMs, revalidator]);

  function dismissNotice(run: DiscoveryRunStatus) {
    const scheduled = autoDismissTimers.current.get(run.id);
    if (scheduled) {
      window.clearTimeout(scheduled.timer);
      autoDismissTimers.current.delete(run.id);
    }
    if (run.status === "running") {
      hiddenRunningIds.current.add(run.id);
    }
    setNotices((current) => current.filter((notice) => notice.id !== run.id));
  }

  return (
    <aside className="discovery-notification-layer" aria-label="Discovery status">
      {notices.map((run) => {
        const presentation = describeDiscoveryNotice(run);
        const failed = presentation.kind === "failed";
        const cancelled = presentation.kind === "cancelled";
        const partial = presentation.kind === "partial";
        const running = presentation.kind === "running";
        return (
          <div
            className={`discovery-notice${running ? " notice-running" : failed ? " notice-failed" : cancelled ? " notice-cancelled" : partial ? " notice-partial" : ""}`}
            key={`${run.id}-${run.status}`}
            onAnimationEnd={() => dismissNotice(run)}
            role={failed || partial ? "alert" : "status"}
            style={
              {
                "--jr-discovery-notice-duration": `${notificationDurationMs}ms`,
              } as CSSProperties
            }
          >
            <span className="discovery-notice-icon">
              {running ? (
                <LoaderCircle className="spin" size={20} />
              ) : failed || partial ? (
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
                {!running && !failed && !cancelled ? (
                  <Link to={`/?profile=${run.profileId}`}>View results</Link>
                ) : null}
                <Link to={`/runs/${run.id}`} aria-label={`View run #${run.id}`}>
                  View run
                </Link>
              </div>
            </div>
            <IconButton onClick={() => dismissNotice(run)} label="Dismiss discovery notification">
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
  readonly kind: DiscoveryRunOutcome | "running";
  readonly title: string;
  readonly message: string;
} {
  if (run.status === "running") {
    return {
      kind: "running",
      title: "Discovery running",
      message: `${run.profileName}: ${describeDiscoveryProgress(run)}`,
    };
  }
  const presentation = presentDiscoveryRunOutcome(run.outcome);
  if (run.outcome === "failed") {
    return {
      kind: presentation.kind,
      title: presentation.title,
      message:
        run.provider || !run.errorSummary.trim()
          ? formatDiscoveryFailure(run)
          : run.errorSummary.trim(),
    };
  }
  if (run.outcome === "cancelled") {
    return {
      kind: presentation.kind,
      title: presentation.title,
      message: `${run.profileName}: Discovery #${run.id} was cancelled after processing ${run.hitCount} search result${run.hitCount === 1 ? "" : "s"}.`,
    };
  }
  if (run.outcome === "partial") {
    const partialFailure =
      run.errorSummary.trim() && run.provider
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
      kind: presentation.kind,
      title: presentation.title,
      message: `${partialFailure} Final totals: ${describeFinalDiscoveryTotals(run)}.`,
    };
  }
  return {
    kind: presentation.kind,
    title: presentation.title,
    message: `${run.profileName}: ${describeFinalDiscoveryTotals(run)}.${run.webCoverageStatus === "skipped" ? " No web search provider was configured." : ""}`,
  };
}

function describeFinalDiscoveryTotals(
  run: Pick<
    DiscoveryRunStatus,
    | "knownBoardCount"
    | "knownBoardCompletedCount"
    | "jobsUpserted"
    | "matchesFound"
    | "webCoverageStatus"
  >,
): string {
  const completedBoards = run.knownBoardCompletedCount ?? run.knownBoardCount ?? 0;
  const webCoverage = run.webCoverageStatus ?? "not recorded";
  return `${completedBoards} board${completedBoards === 1 ? "" : "s"} completed, ${run.jobsUpserted} job${run.jobsUpserted === 1 ? "" : "s"} changed, web coverage ${webCoverage}, and ${run.matchesFound} current profile match${run.matchesFound === 1 ? "" : "es"}`;
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
