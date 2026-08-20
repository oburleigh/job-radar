import { CheckCircle2, CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { getRunsData } from "@/contexts/discovery/adapters/driven/sqlite/radar-read-model";
import { PageHeader } from "@/presentation/components/page-header";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const runs = getRunsData();

  return (
    <div className="page">
      <PageHeader
        index="04"
        title="Discovery history"
        description="See what each search found, how many boards expanded successfully, and where a provider or connector failed."
      />

      <section className="panel run-panel">
        {runs.length > 0 ? (
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
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/runs/${run.id}`} className={`run-status run-${run.status}`}>
                        {run.status === "completed" ? (
                          <CheckCircle2 size={15} />
                        ) : run.status === "failed" ? (
                          <CircleAlert size={15} />
                        ) : (
                          <LoaderCircle size={15} />
                        )}
                        #{run.id}
                      </Link>
                      <small>{formatDate(run.startedAt)}</small>
                    </td>
                    <td>{run.profileName}</td>
                    <td className="capitalize">{run.provider}</td>
                    <td>{run.queryCount}</td>
                    <td>{run.hitCount}</td>
                    <td>{run.boardsDiscovered}</td>
                    <td>{run.jobsUpserted}</td>
                    <td>{run.matchesFound}</td>
                    <td>
                      {run.queryErrorCount + run.syncErrorCount > 0 ? (
                        <span className="error-count" title={run.error || "Connector error"}>
                          {run.queryErrorCount + run.syncErrorCount}
                        </span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                  </tr>
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
            <p>Start discovery from the Jobs page to create the first run.</p>
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
