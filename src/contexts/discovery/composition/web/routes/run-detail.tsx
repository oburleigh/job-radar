import { Button, buttonAttributes, PageHeader } from "@job-radar/design-ui";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleX, LoaderCircle } from "lucide-react";
import { Form, Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import {
  ActiveDiscoveryRun,
  ActiveDiscoveryRunPolling,
} from "@/contexts/discovery/presentation/web/components/active-discovery-run";
import { DiscoveryFunnel } from "@/contexts/discovery/presentation/web/components/discovery-funnel";
import { KnownRoleDiagnostic } from "@/contexts/discovery/presentation/web/components/known-role-diagnostic";
import { parseKnownRoleDiagnosticRequest } from "@/contexts/discovery/presentation/web/requests/known-role-diagnostic-request";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";

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
    pollIntervalMs: discoveryWeb.getUiSettings().discoveryPollIntervalMs,
    requestedJobUrl: requestedJobUrl ?? "",
    diagnostic: diagnostic?.status === "diagnosed" ? diagnostic : null,
    diagnosticError: parsed.status === "invalid" ? parsed.message : null,
  };
}

export default function RunDetailPage() {
  const data = useLoaderData<typeof loader>();
  const { run, queries, requestSummary, pollIntervalMs } = data;
  const outcome = presentDiscoveryRunOutcome(run.outcome);
  const boardEvidence =
    run.knownBoardCount === null || run.knownBoardSuccessCount === null
      ? "Known-board evidence not recorded"
      : `${run.knownBoardSuccessCount} of ${run.knownBoardCount} known boards synchronized`;
  const webEvidence =
    run.webCoverageStatus === null
      ? "Web coverage evidence not recorded"
      : `Web coverage ${run.webCoverageStatus}`;

  return (
    <div className="page">
      <ActiveDiscoveryRunPolling
        enabled={run.status === "running"}
        pollIntervalMs={pollIntervalMs}
      />
      <PageHeader
        title={`Run #${run.id}`}
        description={`${run.profileName} · ${run.provider || "No web provider"} · ${run.queryCount} web requests`}
        actions={
          <Link {...buttonAttributes()} to="/activity">
            <ArrowLeft size={16} />
            Run history
          </Link>
        }
      />

      {run.status !== "running" ? (
        <section
          className={`panel run-panel run-outcome run-outcome-${outcome.kind}`}
          aria-labelledby="run-outcome-heading"
        >
          <div className="section-heading">
            <div>
              <h2 id="run-outcome-heading">{outcome.title}</h2>
            </div>
          </div>
          <p className="run-outcome-detail">
            {boardEvidence} · {webEvidence}
            {run.error ? ` · ${run.error}` : ""}
          </p>
        </section>
      ) : null}

      {run.status === "running" ? (
        <section
          className="panel run-panel active-discovery-run-detail"
          aria-label={`Discovery Run #${run.id} progress`}
        >
          <ActiveDiscoveryRun run={run} showProfileName={false} />
        </section>
      ) : null}

      {run.outcome === "completed" || run.outcome === "partial" ? (
        <DiscoveryFunnel counts={data.funnel} profileId={run.profileId} />
      ) : null}

      <section className="panel run-panel" id="known-role-check">
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

      <section className="panel run-panel" id="query-details">
        <div className="section-heading">
          <h2>Requests by market and lane</h2>
          <span>{run.hitCount} unique search hits</span>
        </div>
        {requestSummary.length > 0 ? (
          <div className="table-wrap">
            <table aria-label="Discovery request evidence">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Locale</th>
                  <th>Lane</th>
                  <th>Strategy</th>
                  <th>Source</th>
                  <th>Page</th>
                  <th>Requests</th>
                  <th>Completed</th>
                  <th>Results</th>
                  <th>Useful hits</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {requestSummary.map((item) => (
                  <tr
                    key={[
                      item.market,
                      item.locale,
                      item.lane,
                      item.strategy,
                      item.source,
                      item.page,
                    ].join("|")}
                  >
                    <td>{item.market}</td>
                    <td>{item.locale}</td>
                    <td className="capitalize">{formatRequestLabel(item.lane)}</td>
                    <td className="capitalize">
                      {item.strategy ? formatRequestLabel(item.strategy) : "Not applicable"}
                    </td>
                    <td>
                      <span className="capitalize">{item.atsType}</span>
                      <br />
                      <span className="muted">{item.source}</span>
                    </td>
                    <td>{item.page ?? "Not recorded"}</td>
                    <td>{item.requestCount}</td>
                    <td>{item.completedRequestCount}</td>
                    <td>{item.rawHitCount}</td>
                    <td>{item.usefulHitCount}</td>
                    <td>{item.errorCount || <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="settings-empty">
            Request-level history is available for granular discovery runs.
          </p>
        )}
      </section>

      {queries.length > 0 ? (
        <section className="panel run-panel">
          <div className="section-heading">
            <h2>Every provider request</h2>
            <span>{queries.length} requests</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Market</th>
                  <th>Locale</th>
                  <th>Lane</th>
                  <th>Strategy</th>
                  <th>Target role</th>
                  <th>Source</th>
                  <th>Page</th>
                  <th>Results</th>
                  <th>Useful hits</th>
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
                        ) : query.status === "cancelled" ? (
                          <CircleX size={15} />
                        ) : (
                          <LoaderCircle size={15} />
                        )}
                        {query.status}
                      </span>
                    </td>
                    <td>{query.marketKey ?? "Not recorded"}</td>
                    <td>{formatRequestLocale(query.searchLanguage, query.countryCode)}</td>
                    <td className="capitalize">{formatRequestLabel(query.laneKind ?? "legacy")}</td>
                    <td className="capitalize">
                      {query.strategy ? formatRequestLabel(query.strategy) : "Not applicable"}
                    </td>
                    <td>{query.titleTerm}</td>
                    <td>
                      <span className="capitalize">{query.atsType}</span>
                      <br />
                      <span className="muted">{query.sourcePattern}</span>
                    </td>
                    <td>{query.page ?? "Not recorded"}</td>
                    <td>{query.hitCount}</td>
                    <td>{query.usefulHitCount}</td>
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

function formatRequestLocale(searchLanguage: string | null, countryCode: string | null): string {
  if (searchLanguage && countryCode) {
    return `${searchLanguage}-${countryCode}`;
  }
  return searchLanguage ?? countryCode ?? "Not recorded";
}

function formatRequestLabel(value: string): string {
  return value.replaceAll("-", " ");
}
