import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { getRunDetail } from "@/contexts/discovery/adapters/driven/sqlite/read-models/runs";

export const dynamic = "force-dynamic";

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const runId = Number.parseInt((await params).id, 10);
  const data = Number.isInteger(runId) ? getRunDetail(runId) : null;
  if (!data) {
    notFound();
  }

  const { run, queries, summary } = data;

  return (
    <div className="page">
      <PageHeader
        index="04"
        title={`Run #${run.id}`}
        description={`${run.profileName} · ${run.provider} · ${run.queryCount} role-title queries`}
        actions={
          <Link className="button button-secondary" href="/runs">
            <ArrowLeft size={16} />
            Run history
          </Link>
        }
      />

      <section className="panel run-panel">
        <div className="section-heading">
          <h2>Queries by ATS</h2>
          <span>{run.hitCount} unique search hits</span>
        </div>
        {summary.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ATS</th>
                  <th>Role queries</th>
                  <th>Completed</th>
                  <th>Results returned</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item) => (
                  <tr key={item.atsType}>
                    <td className="capitalize">{item.atsType}</td>
                    <td>{item.queryCount}</td>
                    <td>{item.completedCount}</td>
                    <td>{item.hitCount}</td>
                    <td>{item.errorCount || <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="settings-empty">
            Query-level history is available for granular discovery runs.
          </p>
        )}
      </section>

      {queries.length > 0 ? (
        <section className="panel run-panel">
          <div className="section-heading">
            <h2>Every role and domain queried</h2>
            <span>{queries.length} queries</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>ATS</th>
                  <th>Target role</th>
                  <th>Domain</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((query) => (
                  <tr key={query.id}>
                    <td>
                      <span
                        className={`run-status run-${
                          query.status === "planned" ? "running" : query.status
                        }`}
                        title={query.error || query.queryText}
                      >
                        {query.status === "completed" ? (
                          <CheckCircle2 size={15} />
                        ) : query.status === "failed" ? (
                          <CircleAlert size={15} />
                        ) : (
                          <LoaderCircle size={15} />
                        )}
                        {query.status}
                      </span>
                    </td>
                    <td className="capitalize">{query.atsType}</td>
                    <td>{query.titleTerm}</td>
                    <td>{query.sourcePattern}</td>
                    <td>{query.hitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
