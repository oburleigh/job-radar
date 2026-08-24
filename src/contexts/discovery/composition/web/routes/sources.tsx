import { buttonAttributes, PageHeader } from "@job-radar/design-ui";
import { DatabaseZap, Plus, Search } from "lucide-react";
import { type ActionFunctionArgs, Link, useLoaderData } from "react-router";
import type { AddJobSourceResult } from "@/contexts/discovery/application/source-coverage/add/result";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { AddBoardForm } from "@/contexts/discovery/presentation/web/components/add-board-form";
import { CompanySitesTable } from "@/contexts/discovery/presentation/web/components/company-sites-table";
import { SyncButton } from "@/contexts/discovery/presentation/web/components/sync-button";
import { ToggleButton } from "@/contexts/discovery/presentation/web/components/toggle-button";
import { parseAddJobSourceRequest } from "@/contexts/discovery/presentation/web/requests/add-job-source-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return { atsLabels: discoveryWeb.getAtsLabels(), data: discoveryWeb.getSourcesData() };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "add-board") {
    const parsed = parseAddJobSourceRequest(formData);
    if (!parsed.ok) {
      return parsed;
    }
    const result = discoveryWeb.addJobSource(parsed.command);
    return { ok: true, message: addJobSourceMessage(result) };
  }
  if (intent === "sync-boards") {
    try {
      const result = await discoveryWeb.syncSourceCoverage();
      return {
        ok: result.failureCount === 0,
        message:
          result.failureCount === 0
            ? `Refreshed ${result.boardCount} boards and wrote ${result.writeCount} jobs.`
            : `Refreshed with ${result.failureCount} board error${result.failureCount === 1 ? "" : "s"}.`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (intent === "toggle-source") {
    discoveryWeb.setSourceCoverageEnabled({
      kind: "source",
      id: Number(formData.get("id")),
      enabled: formData.get("enabled") === "true",
    });
    return { ok: true, message: "Source coverage updated." };
  }
  if (intent === "toggle-board") {
    discoveryWeb.setSourceCoverageEnabled({
      kind: "board",
      id: Number(formData.get("id")),
      enabled: formData.get("enabled") === "true",
    });
    return { ok: true, message: "Board coverage updated." };
  }
  return { ok: false, message: "Unknown source action." };
}

function addJobSourceMessage(result: AddJobSourceResult): string {
  switch (result.status) {
    case "board-added":
      return `${result.atsType} board added.`;
    case "existing-source-enabled":
      return `${result.label} already covers ${result.hostname}; its source is enabled.`;
    case "built-in-covered":
      return `${result.label} is already covered by the built-in search source.`;
    case "search-source-added":
      return `${result.label} search source added. Enable unverified leads on the profile to see its matches.`;
  }
}

export default function SourcesPage() {
  const { atsLabels, data } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHeader
        index="03"
        title="Sources and company boards"
        description="Search across the broad ATS list, then refresh known boards directly without paying for another web search."
        actions={
          <div className="header-action-group">
            <Link {...buttonAttributes("primary")} to="/settings?new=1">
              <Plus size={17} />
              Add ATS integration
            </Link>
            <SyncButton />
          </div>
        }
      />

      <section className="source-section">
        <div className="section-heading">
          <h2>Where discovery looks</h2>
          <span>{data.sources.filter((source) => source.enabled).length} active</span>
        </div>
        <ol className="source-grid">
          {data.sources.map((source, index) => (
            <li className="source-card" key={source.id}>
              <span className="source-record-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="source-card-icon">
                {source.supportsBoardSync ? <DatabaseZap size={19} /> : <Search size={19} />}
              </div>
              <div className="source-card-copy">
                <strong>{atsLabels[source.atsType] ?? source.atsType}</strong>
                <span>{source.pattern}</span>
              </div>
              <span className="source-mode">
                {source.supportsBoardSync ? "Direct board sync" : "Search results only"}
              </span>
              <ToggleButton
                id={source.id}
                enabled={source.enabled}
                kind="source"
                label={source.pattern}
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="source-section">
        <div className="section-heading">
          <h2>Known company career sites</h2>
          <span>{data.boards.length} discovered</span>
        </div>

        <div className="panel">
          <AddBoardForm />
          <CompanySitesTable boards={data.boards} atsLabels={atsLabels} />
        </div>
      </section>
    </div>
  );
}
