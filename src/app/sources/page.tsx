import { CheckCircle2, CircleAlert, DatabaseZap, Plus, Search } from "lucide-react";
import Link from "next/link";
import { getSourcesData } from "@/contexts/discovery/adapters/driven/sqlite/radar-read-model";
import { getAtsLabels } from "@/infrastructure/discovery/catalog";
import { AddBoardForm } from "@/presentation/components/add-board-form";
import { PageHeader } from "@/presentation/components/page-header";
import { SyncButton } from "@/presentation/components/sync-button";
import { ToggleButton } from "@/presentation/components/toggle-button";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const data = getSourcesData();
  const atsLabels = getAtsLabels();

  return (
    <div className="page">
      <PageHeader
        index="03"
        title="Sources and company boards"
        description="Search across the broad ATS list, then refresh known boards directly without paying for another web search."
        actions={
          <div className="header-action-group">
            <Link className="button button-primary" href="/settings?new=1">
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
          {data.boards.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company or slug</th>
                    <th>ATS</th>
                    <th>Last refresh</th>
                    <th>Health</th>
                    <th>
                      <span className="sr-only">Enabled</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.boards.map((board) => (
                    <tr key={board.id}>
                      <td>
                        <a href={board.baseUrl} target="_blank" rel="noreferrer">
                          {board.companyName || board.slug}
                        </a>
                        <small>{board.baseUrl}</small>
                      </td>
                      <td>{atsLabels[board.atsType] ?? board.atsType}</td>
                      <td>{formatDate(board.lastSyncedAt)}</td>
                      <td>
                        <span
                          className={board.lastError ? "health health-error" : "health health-ok"}
                        >
                          {board.lastError ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}
                          {board.lastError ? "Needs attention" : "Ready"}
                        </span>
                      </td>
                      <td>
                        <ToggleButton
                          id={board.id}
                          enabled={board.enabled}
                          kind="board"
                          label={board.companyName || board.slug}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-empty">
              Add a known ATS URL or run discovery to populate this registry.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "Not refreshed";
}
