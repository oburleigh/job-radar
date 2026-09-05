import { IconButton } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { Link, useRevalidator } from "react-router";
import { Toaster, toast } from "sonner";
import type { DiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";
import type {
  DiscoveryRunPhase,
  WebCoverageStatus,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";
import {
  DISCOVERY_RUN_START_EVENT,
  type DiscoveryRunStartEventDetail,
} from "@/contexts/discovery/presentation/web/client-events";
import { describeDiscoveryProgress } from "@/contexts/discovery/presentation/web/components/active-discovery-run";
import {
  formatDiscoveryFailure,
  formatRunFailureDetail,
  isStaleRunSummary,
} from "@/contexts/discovery/presentation/web/formatters/discovery-failure";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";

const PENDING_RUNS_KEY = "job-radar.pending-discovery-runs";
const DISCOVERY_TOASTER_ID = "discovery-notifications";
export const DISCOVERY_NOTICE_REGION_LABEL = "Discovery status";
const DISCOVERY_NOTICE_EXIT_DURATION_MS = 320;

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
  const startingToastIds = useRef(new Map<string, string>());
  const startingRunIds = useRef(new Map<string, number>());
  const dismissedStartingRequests = useRef(new Set<string>());
  const runToastIds = useRef(new Map<number, string>());
  const polling = useRef(false);

  useEffect(() => {
    let active = true;

    function forgetRunToast(runId: number) {
      runToastIds.current.delete(runId);
      for (const [requestId, acceptedRunId] of startingRunIds.current) {
        if (acceptedRunId === runId) {
          startingRunIds.current.delete(requestId);
          startingToastIds.current.delete(requestId);
          dismissedStartingRequests.current.delete(requestId);
        }
      }
    }

    function hideStartingRequest(requestId: string) {
      dismissedStartingRequests.current.add(requestId);
      const runId = startingRunIds.current.get(requestId);
      if (runId) {
        hiddenRunningIds.current.add(runId);
      }
    }

    function showStartingNotice(
      detail: Extract<DiscoveryRunStartEventDetail, { readonly state: "starting" }>,
    ) {
      const toastId = `discovery-request-${detail.requestId}`;
      startingToastIds.current.set(detail.requestId, toastId);
      const dismiss = () => {
        hideStartingRequest(detail.requestId);
        toast.dismiss(toastId);
      };
      toast.custom(
        () => {
          return (
            <DiscoveryNoticeContent
              kind="running"
              message={`${detail.profileName}: Starting discovery`}
              onDismiss={dismiss}
              profileId={detail.profileId}
              title="Discovery running"
            />
          );
        },
        {
          className: "discovery-notice notice-running",
          duration: notificationDurationMs + DISCOVERY_NOTICE_EXIT_DURATION_MS,
          id: toastId,
          onAutoClose: () => hideStartingRequest(detail.requestId),
          onDismiss: () => hideStartingRequest(detail.requestId),
          toasterId: DISCOVERY_TOASTER_ID,
          unstyled: true,
          style: {
            "--discovery-notice-hold-duration": `${notificationDurationMs}ms`,
          } as CSSProperties,
        },
      );
    }

    function showNotice(run: DiscoveryRunStatus) {
      if (run.status === "running") {
        if (hiddenRunningIds.current.has(run.id) || runToastIds.current.has(run.id)) {
          return;
        }
      } else {
        hiddenRunningIds.current.delete(run.id);
      }

      const currentToastId = runToastIds.current.get(run.id);
      if (run.status !== "running" && currentToastId) {
        toast.dismiss(currentToastId);
      }
      const toastId =
        run.status === "running"
          ? (currentToastId ?? `discovery-run-${run.id}`)
          : `discovery-run-${run.id}-${run.status}`;
      runToastIds.current.set(run.id, toastId);
      const presentation = describeDiscoveryNotice(run);
      const dismiss = () => {
        if (run.status === "running") {
          hiddenRunningIds.current.add(run.id);
        } else {
          forgetRunToast(run.id);
        }
        toast.dismiss(toastId);
      };
      toast.custom(
        () => {
          return (
            <DiscoveryNoticeContent
              kind={presentation.kind}
              message={presentation.message}
              onDismiss={dismiss}
              profileId={run.profileId}
              runId={run.id}
              title={presentation.title}
            />
          );
        },
        {
          className: discoveryNoticeClassName(presentation.kind),
          duration: notificationDurationMs + DISCOVERY_NOTICE_EXIT_DURATION_MS,
          id: toastId,
          onAutoClose: () => {
            if (run.status === "running") {
              hiddenRunningIds.current.add(run.id);
            } else {
              forgetRunToast(run.id);
            }
          },
          onDismiss: () => {
            if (run.status === "running") {
              hiddenRunningIds.current.add(run.id);
            } else {
              forgetRunToast(run.id);
            }
          },
          toasterId: DISCOVERY_TOASTER_ID,
          unstyled: true,
          style: {
            "--discovery-notice-hold-duration": `${notificationDurationMs}ms`,
          } as CSSProperties,
        },
      );
    }

    function acceptStartingRequest(requestId: string, runId: number) {
      startingRunIds.current.set(requestId, runId);
      const startingToastId = startingToastIds.current.get(requestId);
      if (startingToastId) {
        runToastIds.current.set(runId, startingToastId);
      }
      if (dismissedStartingRequests.current.has(requestId)) {
        hiddenRunningIds.current.add(runId);
      }
      trackRun(runId);
      void revalidator.revalidate();
      void pollRuns();
    }

    function rejectStartingRequest(requestId: string) {
      const toastId = startingToastIds.current.get(requestId);
      if (toastId) {
        toast.dismiss(toastId);
      }
      startingToastIds.current.delete(requestId);
      startingRunIds.current.delete(requestId);
      dismissedStartingRequests.current.delete(requestId);
    }

    function handleStartEvent(event: Event) {
      const detail = (event as CustomEvent<DiscoveryRunStartEventDetail>).detail;
      if (!detail) {
        return;
      }
      if (detail.state === "starting") {
        showStartingNotice(detail);
      } else if (detail.state === "accepted") {
        acceptStartingRequest(detail.requestId, detail.runId);
      } else {
        rejectStartingRequest(detail.requestId);
      }
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
    window.addEventListener(DISCOVERY_RUN_START_EVENT, handleStartEvent);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(DISCOVERY_RUN_START_EVENT, handleStartEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [notificationDurationMs, pollIntervalMs, revalidator]);

  return (
    <Toaster
      className="discovery-notification-layer"
      containerAriaLabel={DISCOVERY_NOTICE_REGION_LABEL}
      duration={notificationDurationMs}
      expand
      gap={8}
      id={DISCOVERY_TOASTER_ID}
      mobileOffset={{ top: 72, right: 10, left: 10 }}
      offset={{ top: 88, right: 18 }}
      position="top-right"
      toastOptions={{
        closeButtonAriaLabel: "Dismiss discovery notification",
        unstyled: true,
      }}
    />
  );
}

interface DiscoveryNoticeContentProps {
  readonly kind: DiscoveryRunOutcome | "running";
  readonly message: string;
  readonly onDismiss: () => void;
  readonly profileId: number;
  readonly runId?: number;
  readonly title: string;
}

function DiscoveryNoticeContent({
  kind,
  message,
  onDismiss,
  profileId,
  runId,
  title,
}: DiscoveryNoticeContentProps) {
  const running = kind === "running";
  const failed = kind === "failed";
  const cancelled = kind === "cancelled";
  const partial = kind === "partial";
  return (
    <div className="discovery-notice-content" role={failed || partial ? "alert" : "status"}>
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
        <strong>{title}</strong>
        <p>{message}</p>
        {runId ? (
          <div className="discovery-notice-links">
            {!running && !failed && !cancelled ? (
              <Link to={`/?profile=${profileId}`}>View results</Link>
            ) : null}
            <Link to={`/runs/${runId}`} aria-label={`View run #${runId}`}>
              View run
            </Link>
          </div>
        ) : null}
      </div>
      <IconButton onClick={onDismiss} label="Dismiss discovery notification">
        <X size={17} />
      </IconButton>
    </div>
  );
}

function discoveryNoticeClassName(kind: DiscoveryRunOutcome | "running"): string {
  if (kind === "running") {
    return "discovery-notice notice-running";
  }
  if (kind === "failed") {
    return "discovery-notice notice-failed";
  }
  if (kind === "cancelled") {
    return "discovery-notice notice-cancelled";
  }
  if (kind === "partial") {
    return "discovery-notice notice-partial";
  }
  return "discovery-notice";
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
          : formatRunFailureDetail(run.errorSummary.trim()),
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
      run.errorSummary.trim() && (run.provider || isStaleRunSummary(run.errorSummary))
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
