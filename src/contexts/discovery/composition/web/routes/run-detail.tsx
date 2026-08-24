import { Button, buttonAttributes, PageHeader } from "@job-radar/design-ui";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { Form, Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { KnownRoleDiagnostic } from "@/contexts/discovery/presentation/web/components/known-role-diagnostic";
import { parseKnownRoleDiagnosticRequest } from "@/contexts/discovery/presentation/web/requests/known-role-diagnostic-request";

export function loader({ params, request }: LoaderFunctionArgs) {
  const runId = Number.parseInt(params.runId ?? "", 10);
  const data = Number.isInteger(runId) ? discoveryWeb.getRunDetail(runId) : null;
  if (!data) {
    throw new Response("Run not found", { status: 404 });
  }
  const requestedJobUrl = new URL(request.url).searchParams.get("jobUrl");
  const parsed = parseKnownRoleDiagnosticRequest(requestedJobUrl, runId);
  const diagnostic =
    parsed.status === "valid" ? discoveryWeb.diagnoseKnownRole(parsed.command) : null;
  return {
    ...data,
    requestedJobUrl: requestedJobUrl ?? "",
    diagnostic: diagnostic?.status === "diagnosed" ? diagnostic : null,
    diagnosticError: parsed.status === "invalid" ? parsed.message : null,
  };
}

export default function RunDetailPage() {
  const data = useLoaderData<typeof loader>();
  const { run, queries, summary } = data;

  return (
    <div className="page">
      <PageHeader
        index="04"
        title={`Run #${run.id}`}
        description={`${run.profileName} · ${run.provider} · ${run.queryCount} role-title queries`}
        actions={
          <Link {...buttonAttributes()} to="/runs">
            <ArrowLeft size={16} />
            Run history
          </Link>
        }
      />

      <section className="panel run-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Known role check</p>
            <h2>Explain a missed role</h2>
          </div>
          <span>Trace one public URL through this run</span>
        </div>
        <Form method="get" className="known-role-form">
          <label htmlFor="known-role-url">
            <span>Public job URL</span>
            <input
              id="known-role-url"
              name="jobUrl"
              type="url"
              defaultValue={data.requestedJobUrl}
              placeholder="https://jobs.example.com/company/role"
              required
            />
          </label>
          <Button type="submit" variant="primary">
            Explain this role
          </Button>
          <p className="field-help">
            Shows query planning, provider return, classification, verification, and the final
            profile decision without exposing provider settings.
          </p>
          {data.diagnosticError ? <p role="alert">{data.diagnosticError}</p> : null}
        </Form>
        {data.diagnostic ? <KnownRoleDiagnostic diagnostic={data.diagnostic} /> : null}
      </section>

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
                  <tr key={query.id} id={`query-${query.id}`}>
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
