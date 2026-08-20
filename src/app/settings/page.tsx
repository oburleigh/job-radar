import { Database, Plus } from "lucide-react";
import Link from "next/link";

import { ATS_TYPES } from "@/application/discovery/types";
import { getSettingsData } from "@/infrastructure/read-models/radar";
import { IntegrationSettingsForm } from "@/presentation/components/integration-settings-form";
import { PageHeader } from "@/presentation/components/page-header";
import { RuntimeSettingsForm } from "@/presentation/components/runtime-settings-form";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const data = getSettingsData();
  const params = await searchParams;
  const requested = Array.isArray(params.ats) ? params.ats[0] : params.ats;
  const createMode = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";
  const selectedType = data.integrations.some((integration) => integration.atsType === requested)
    ? requested
    : data.integrations[0]?.atsType;
  const selected = data.integrations.find((integration) => integration.atsType === selectedType);
  const editorIntegration = createMode
    ? {
        atsType: "",
        label: "",
        searchPatterns: [],
        hostnames: [],
        hostSuffixes: [],
        supportsBoardSync: false,
        priority: 200,
        pageSize: null,
        endpoints: {},
      }
    : selected;

  return (
    <div className="page">
      <PageHeader
        index="05"
        title="Settings"
        description="Edit runtime defaults and ATS integration rules. Changes are stored in the local database and take effect on the next operation."
        actions={
          <div className="header-action-group">
            <span className="database-badge">
              <Database size={16} />
              SQLite backed
            </span>
            <Link className="button button-primary" href="/settings?new=1">
              <Plus size={17} />
              New integration
            </Link>
          </div>
        }
      />

      <section className="settings-section">
        <div className="section-heading">
          <h2>Discovery and matching</h2>
          <span>No restart required</span>
        </div>
        <div className="profile-editor">
          <RuntimeSettingsForm
            settings={{
              network: data.network,
              discovery: data.discovery,
              ui: data.ui,
              matching: data.matching,
              searchProviders: data.searchProviders,
            }}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <h2>ATS registry</h2>
          <span>{data.integrations.length} configured systems</span>
        </div>
        <div className="profile-layout">
          <aside className="profile-list">
            <p className="index-label">ATS platforms</p>
            {data.integrations.map((integration) => (
              <Link
                key={integration.atsType}
                href={`/settings?ats=${integration.atsType}`}
                className={
                  !createMode && integration.atsType === selected?.atsType
                    ? "profile-link active"
                    : "profile-link"
                }
              >
                <span>{integration.label}</span>
                <small>
                  {integration.searchPatterns.length} source{" "}
                  {integration.searchPatterns.length === 1 ? "pattern" : "patterns"}
                </small>
              </Link>
            ))}
          </aside>
          <div className="profile-editor">
            {editorIntegration ? (
              <>
                <div className="editor-heading">
                  <h2>{createMode ? "New search integration" : editorIntegration.label}</h2>
                </div>
                <IntegrationSettingsForm
                  integration={editorIntegration}
                  isNew={createMode}
                  canConfigureSync={
                    !createMode &&
                    (ATS_TYPES as readonly string[]).includes(editorIntegration.atsType)
                  }
                />
              </>
            ) : (
              <p className="settings-empty">No ATS integrations configured.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
