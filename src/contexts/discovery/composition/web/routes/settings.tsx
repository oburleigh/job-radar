import { buttonAttributes, PageHeader } from "@job-radar/design-ui";
import { Database, Plus } from "lucide-react";
import { type ActionFunctionArgs, Link, redirect, useLoaderData } from "react-router";
import type { SaveAtsIntegrationResult } from "@/contexts/discovery/application/ats-integrations/save/result";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { IntegrationSettingsForm } from "@/contexts/discovery/presentation/web/components/integration-settings-form";
import { RuntimeSettingsForm } from "@/contexts/discovery/presentation/web/components/runtime-settings-form";
import { parseAtsIntegrationRequest } from "@/contexts/discovery/presentation/web/requests/ats-integration-request";
import { parseRuntimeSettingsRequest } from "@/contexts/discovery/presentation/web/requests/runtime-settings-request";
import {
  resolveSettingsSelection,
  settingsUrl,
} from "@/contexts/discovery/presentation/web/settings-selection";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader({ request }: { readonly request: Request }) {
  const data = discoveryWeb.getSettingsData();
  const searchParams = new URL(request.url).searchParams;
  const selection = validatedSelection(searchParams);
  const requested = searchParams.get("ats") ?? undefined;
  const createMode = searchParams.get("new") === "1";
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
        priority: data.integrationPolicy.customPriority,
        pageSize: null,
        endpoints: {},
      }
    : selected;

  return {
    canConfigureSync: Boolean(
      !createMode &&
        editorIntegration &&
        discoveryWeb.canConfigureBoardSync(editorIntegration.atsType),
    ),
    createMode,
    data,
    editorIntegration,
    selection,
    selected,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "save-runtime-settings") {
    const parsed = parseRuntimeSettingsRequest(formData, discoveryWeb.getRuntimeSettings());
    if (!parsed.ok) {
      return parsed;
    }
    const result = discoveryWeb.saveRuntimeSettings(parsed.command);
    if (result.status === "rejected") {
      return { ok: false, message: `Invalid runtime setting: ${result.field}.` };
    }
    return { ok: true, message: "Runtime settings saved to SQLite." };
  }
  if (intent === "save-integration") {
    const parsed = parseAtsIntegrationRequest(formData);
    if (!parsed.ok) {
      return parsed;
    }
    const result = discoveryWeb.saveAtsIntegration(parsed.command);
    if (result.status === "rejected") {
      return { ok: false, message: integrationRejectionMessage(result) };
    }
    if (result.created) {
      const selection = validatedSelection(new URL(request.url).searchParams);
      return redirect(settingsUrl(selection, { ats: result.atsType }));
    }
    return { ok: true, message: `${result.label} settings saved to SQLite.` };
  }
  return { ok: false, message: "Unknown settings action." };
}

function integrationRejectionMessage(
  result: Extract<SaveAtsIntegrationResult, { status: "rejected" }>,
): string {
  switch (result.reason) {
    case "custom-sync-not-supported":
      return "Custom integrations are search-only until a direct connector is implemented.";
    case "already-exists":
      return "That integration ID already exists.";
    case "not-found":
      return "Integration not found.";
    case "missing-host-rule":
      return "Add an exact hostname or suffix so custom result URLs can be recognized.";
    case "pattern-conflict":
      return `${result.pattern} already belongs to ${result.owner}.`;
  }
}

function validatedSelection(searchParams: URLSearchParams) {
  return resolveSettingsSelection(
    searchParams,
    discoveryWeb.getProfiles(),
    discoveryWeb.getSearchProviderOptions(),
  );
}

export default function SettingsPage() {
  const { canConfigureSync, createMode, data, editorIntegration, selected, selection } =
    useLoaderData<typeof loader>();

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
            <Link {...buttonAttributes("primary")} to={settingsUrl(selection, { create: true })}>
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
              integrationPolicy: data.integrationPolicy,
              profileDefaults: data.profileDefaults,
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
                to={settingsUrl(selection, { ats: integration.atsType })}
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
                  canConfigureSync={canConfigureSync}
                  formAction={settingsUrl(selection)}
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
