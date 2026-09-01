import { PageHeader } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, Clock3, LoaderCircle } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import {
  ActiveDiscoveryRun,
  ActiveDiscoveryRunPolling,
} from "@/contexts/discovery/presentation/web/components/active-discovery-run";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";
import {
  isActiveResearchRunActivity,
  type ResearchRunActivity,
} from "@/contexts/recruiter-engagement/public-contract";
import { recruiterActivityContract } from "@/contexts/recruiter-engagement/public-contract.server";

export async function loader() {
  const [researchRuns, discoveryRuns] = await Promise.all([
    recruiterActivityContract.listResearchRuns(),
    Promise.resolve(discoveryWeb.getRunsData()),
  ]);
  return {
    discoveryRuns,
    items: [
      ...discoveryRuns.map(discoveryActivity),
      ...researchRuns.map(researchActivity),
    ].toSorted((left, right) => right.startedAt.getTime() - left.startedAt.getTime()),
    pollIntervalMs: discoveryWeb.getUiSettings().discoveryPollIntervalMs,
  };
}

type ActivityItem = ReturnType<typeof discoveryActivity> | ReturnType<typeof researchActivity>;

export default function ActivityPage() {
  const { discoveryRuns, items, pollIntervalMs } = useLoaderData<typeof loader>();
  const activeDiscoveryRuns = discoveryRuns.filter((run) => run.status === "running");
  const active = items.some((item) => item.active);
  return (
    <div className="page">
      <ActiveDiscoveryRunPolling enabled={active} pollIntervalMs={pollIntervalMs} />
      <PageHeader
        title="Activity"
        description="Review Discovery Runs and Research Runs without losing the feature and settings that produced each one."
      />
      {activeDiscoveryRuns.length > 0 ? (
        <section className="active-discovery-runs" aria-label="Active Discovery Runs">
          <div className="section-heading">
            <h2>Active Discovery Runs</h2>
            <span>{activeDiscoveryRuns.length} running</span>
          </div>
          <div className="active-discovery-run-list">
            {activeDiscoveryRuns.map((run) => (
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
      <section className="panel run-panel" aria-labelledby="activity-log-title">
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
          <div className="empty-state compact">
            <span className="empty-icon">
              <Clock3 size={27} />
            </span>
            <h2>No runs recorded</h2>
            <p>Start an Opportunity discovery or Recruiter Search to create the first run.</p>
          </div>
        )}
      </section>
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
    <tr>
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
      <td>{item.outcome}</td>
    </tr>
  );
}

function discoveryActivity(run: ReturnType<typeof discoveryWeb.getRunsData>[number]) {
  const outcome = presentDiscoveryRunOutcome(run.outcome);
  return {
    active: run.status === "running",
    href: `/runs/${run.id}`,
    id: `#${run.id}`,
    kind: "discovery" as const,
    outcome: `${run.jobsUpserted} job writes · ${run.matchesFound} matches`,
    scope: `${run.profileName} · ${run.provider || "No web provider"}`,
    startedAt: run.startedAt,
    status: outcome.label,
    tone: outcome.kind,
    type: "Discovery Run" as const,
  };
}

function researchActivity(run: ResearchRunActivity) {
  const active = isActiveResearchRunActivity(run);
  const status = titleCase(run.status);
  return {
    active,
    href: `/recruiter-search?run=${encodeURIComponent(run.id)}`,
    id: run.id,
    kind: "research" as const,
    outcome: run.completionReason ?? `${run.checkpoint} stage`,
    scope: run.brief.description || run.brief.criteria.specialisms.join(", "),
    startedAt: run.startedAt,
    status,
    tone: active
      ? ("running" as const)
      : run.status === "completed"
        ? ("completed" as const)
        : run.status === "cancelled"
          ? ("cancelled" as const)
          : run.status === "partial"
            ? ("partial" as const)
            : ("failed" as const),
    type: "Research Run" as const,
  };
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
