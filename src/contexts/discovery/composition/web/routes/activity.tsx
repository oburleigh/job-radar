import { Card, PageHeader, Panel } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, Clock3, LoaderCircle } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import {
  type ActivityItem,
  loadActivityData,
} from "@/contexts/discovery/composition/web/activity-data.server";
import {
  ActiveDiscoveryRun,
  ActiveDiscoveryRunPolling,
} from "@/contexts/discovery/presentation/web/components/active-discovery-run";

export const loader = loadActivityData;

export default function ActivityPage() {
  const { discoveryRuns, items, errors, pollIntervalMs } = useLoaderData<typeof loader>();
  const activeDiscoveryRuns = discoveryRuns.filter((run) => run.status === "running");
  const active = items.some((item) => item.active);
  return (
    <div className="page">
      <ActiveDiscoveryRunPolling enabled={active} pollIntervalMs={pollIntervalMs} />
      <PageHeader
        title="Activity"
        description="Review Discovery Runs, Research Runs, and Advisor attempts with their outcomes and settings."
      />
      {errors.map((message) => (
        <p key={message} role="alert">
          {message}
        </p>
      ))}
      {activeDiscoveryRuns.length > 0 ? (
        <Panel as="section" className="active-discovery-runs" aria-label="Active Discovery Runs">
          <div className="section-heading">
            <h2>Active Discovery Runs</h2>
            <span>{activeDiscoveryRuns.length} running</span>
          </div>
          <div className="active-discovery-run-list">
            {activeDiscoveryRuns.map((run) => (
              <Card
                padding="none"
                tone="outlined"
                aria-label={`Discovery Run #${run.id}`}
                key={run.id}
              >
                <ActiveDiscoveryRun run={run} showRunLink />
              </Card>
            ))}
          </div>
        </Panel>
      ) : null}
      <Panel as="section" className="run-panel" aria-labelledby="activity-log-title">
        <div className="section-heading">
          <h2 id="activity-log-title">Run history</h2>
          <span>{items.length} recorded</span>
        </div>
        {items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Feature</th>
                  <th>Started</th>
                  <th>Scope</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ActivityRow item={item} key={`${item.kind}-${item.id}`} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Panel className="empty-state compact" padding="comfortable">
            <span className="empty-icon">
              <Clock3 size={27} />
            </span>
            <h2>No runs recorded</h2>
            <p>Start an Opportunity discovery or Recruiter Search to create the first run.</p>
          </Panel>
        )}
      </Panel>
    </div>
  );
}

function ActivityRow({ item }: { readonly item: ActivityItem }) {
  const Icon =
    item.tone === "completed"
      ? CheckCircle2
      : item.tone === "cancelled"
        ? CircleX
        : item.tone === "running"
          ? LoaderCircle
          : CircleAlert;
  return (
    <tr id={`${item.kind}-${item.id}`}>
      <td>
        <Link
          className={`run-status run-${item.tone}`}
          to={item.href}
          aria-label={
            item.kind === "discovery"
              ? `Run ${item.id} ${item.status}`
              : `${item.type} ${item.id} ${item.status}`
          }
        >
          <Icon size={15} aria-hidden="true" /> {item.status} · {item.id}
        </Link>
      </td>
      <td>{item.type}</td>
      <td>{formatDate(item.startedAt)}</td>
      <td>{item.scope}</td>
      <td>
        {item.outcome}
        {item.kind === "advisor" && item.retryOf !== null ? (
          <>
            {" "}
            · <Link to={`#advisor-${item.retryOf}`}>Retry of #{item.retryOf}</Link>
          </>
        ) : null}
      </td>
    </tr>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}
