import { PageHeader } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, Clock3, LoaderCircle } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import {
  ActiveDiscoveryRun,
  ActiveDiscoveryRunPolling,
} from "@/contexts/discovery/presentation/web/components/active-discovery-run";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";

export function loader() {
  return {
    runs: discoveryWeb.getRunsData(),
    pollIntervalMs: discoveryWeb.getUiSettings().discoveryPollIntervalMs,
  };
}

export default function RunsPage() {
  const { runs, pollIntervalMs } = useLoaderData<typeof loader>();
  const activeRuns = runs.filter((run) => run.status === "running");
  const recordedRuns = runs.filter((run) => run.status !== "running");

  return (
    <div className="page">
      <ActiveDiscoveryRunPolling enabled={activeRuns.length > 0} pollIntervalMs={pollIntervalMs} />
      <PageHeader
        title="Discovery history"
        description="See what each search found, how many boards expanded successfully, and where a provider or adapter failed."
      />

      {activeRuns.length > 0 ? (
        <section className="active-discovery-runs" aria-label="Active Discovery Runs">
          <div className="section-heading">
            <div>
              <h2>Active Discovery Runs</h2>
            </div>
            <span>{activeRuns.length} running</span>
          </div>
          <div className="active-discovery-run-list">
            {activeRuns.map((run) => (
              <article
                className="active-discovery-run-card"
                aria-label={`Discovery Run #${run.id}`}
                key={run.id}
              >
                <ActiveDiscoveryRun run={run} showRunLink />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel run-panel">
        {recordedRuns.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Profile</th>
                  <th>Provider</th>
                  <th>Queries</th>
                  <th>Hits</th>
                  <th>Boards</th>
                  <th>Job writes</th>
                  <th>Matches after run</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {recordedRuns.map((run) => {
                  const outcome = presentDiscoveryRunOutcome(run.outcome);
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link
                          to={`/runs/${run.id}`}
                          className={`run-status run-${outcome.kind}`}
                          aria-label={`Run #${run.id} ${outcome.label}`}
                          title={outcome.title}
                        >
                          {outcome.kind === "completed" ? (
                            <CheckCircle2 size={15} />
                          ) : outcome.kind === "failed" || outcome.kind === "partial" ? (
                            <CircleAlert size={15} />
                          ) : outcome.kind === "cancelled" ? (
                            <CircleX size={15} />
                          ) : (
                            <LoaderCircle size={15} />
                          )}
                          {outcome.label} · #{run.id}
                        </Link>
                        <small>{formatDate(run.startedAt)}</small>
                      </td>
                      <td>{run.profileName}</td>
                      <td className="capitalize">{run.provider || "Not configured"}</td>
                      <td>{run.queryCount}</td>
                      <td>{run.hitCount}</td>
                      <td>{run.boardsDiscovered}</td>
                      <td>{run.jobsUpserted}</td>
                      <td>{run.matchesFound}</td>
                      <td>
                        {run.queryErrorCount + run.syncErrorCount > 0 ? (
                          <span className="error-count" title={run.error || "Adapter error"}>
                            {run.queryErrorCount + run.syncErrorCount}
                          </span>
                        ) : (
                          <span className="muted">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : runs.length === 0 ? (
          <div className="empty-state compact">
            <span className="empty-icon">
              <Clock3 size={27} />
            </span>
            <h2>No runs recorded</h2>
            <p>Start discovery from the Jobs page to create the first run.</p>
          </div>
        ) : (
          <div className="empty-state compact">
            <span className="empty-icon">
              <Clock3 size={27} />
            </span>
            <h2>No completed runs yet</h2>
            <p>Active progress is shown above and will move into history when it finishes.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
