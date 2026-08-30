import { buttonAttributes } from "@job-radar/design-ui";
import { Plus } from "lucide-react";
import { type ActionFunctionArgs, Link, redirect, useLoaderData } from "react-router";
import type { SaveAtsIntegrationResult } from "@/contexts/discovery/application/ats-integrations/save/result";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { IntegrationSettingsForm } from "@/contexts/discovery/presentation/web/components/integration-settings-form";
import { parseAtsIntegrationRequest } from "@/contexts/discovery/presentation/web/requests/ats-integration-request";
import { settingsUrl } from "@/contexts/discovery/presentation/web/settings-url";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader({ request }: { readonly request: Request }) {
  const data = discoveryWeb.getSettingsData();
  const searchParams = new URL(request.url).searchParams;
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
    editorIntegration,
    integrations: data.integrations,
    selected,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parseAtsIntegrationRequest(await request.formData());
  if (!parsed.ok) return parsed;
  const result = discoveryWeb.saveAtsIntegration(parsed.command);
  if (result.status === "rejected")
    return { ok: false, message: integrationRejectionMessage(result) };
  if (result.created) return redirect(settingsUrl({ ats: result.atsType }));
  return { ok: true, message: `${result.label} settings saved to SQLite.` };
}

export default function AtsRegistrySettingsPage() {
  const { canConfigureSync, createMode, editorIntegration, integrations, selected } =
    useLoaderData<typeof loader>();
  return (
    <section className="settings-section" aria-labelledby="ats-registry-title">
      <div className="section-heading">
        <h2 id="ats-registry-title">ATS Registry</h2>
        <div className="section-heading-actions">
          <span>{integrations.length} configured systems</span>
          <Link
            {...buttonAttributes("primary")}
            to={`${settingsUrl({ create: true })}#ats-integration-editor`}
          >
            <Plus size={17} /> Add integration
          </Link>
        </div>
      </div>
      <div className="profile-layout">
        <aside className="profile-list">
          <p className="index-label">ATS platforms</p>
          {integrations.map((integration) => (
            <Link
              key={integration.atsType}
              to={settingsUrl({ ats: integration.atsType })}
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
        <div className="profile-editor" id="ats-integration-editor">
          {editorIntegration ? (
            <>
              <div className="editor-heading">
                <h3>{createMode ? "New search integration" : editorIntegration.label}</h3>
              </div>
              <IntegrationSettingsForm
                integration={editorIntegration}
                isNew={createMode}
                canConfigureSync={canConfigureSync}
                formAction={settingsUrl()}
              />
            </>
          ) : (
            <p className="settings-empty">No ATS integrations configured.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function integrationRejectionMessage(
  result: Extract<SaveAtsIntegrationResult, { status: "rejected" }>,
): string {
  switch (result.reason) {
    case "custom-sync-not-supported":
      return "Custom integrations are search-only until direct sync is available.";
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
