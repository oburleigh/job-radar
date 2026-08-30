import { type ActionFunctionArgs, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { RuntimeSettingsForm } from "@/contexts/discovery/presentation/web/components/runtime-settings-form";
import { parseRuntimeSettingsRequest } from "@/contexts/discovery/presentation/web/requests/runtime-settings-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return discoveryWeb.getSettingsData();
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parseRuntimeSettingsRequest(
    await request.formData(),
    discoveryWeb.getRuntimeSettings(),
  );
  if (!parsed.ok) return parsed;
  const result = discoveryWeb.saveRuntimeSettings(parsed.command);
  if (result.status === "rejected")
    return {
      ok: false,
      field: result.field,
      message:
        result.field === "providerRetryMaxDelayMs"
          ? "Maximum retry delay must be at least the first retry delay."
          : "The highlighted setting is outside its allowed range.",
    };
  return { ok: true, message: "Runtime settings saved to SQLite." };
}

export default function OpportunitySettingsPage() {
  const data = useLoaderData<typeof loader>();
  return (
    <section className="settings-section" aria-labelledby="opportunity-settings-title">
      <div className="section-heading">
        <h2 id="opportunity-settings-title">Opportunity settings</h2>
      </div>
      <div className="profile-editor">
        <RuntimeSettingsForm
          action="/settings/opportunities"
          settings={{
            network: data.network,
            discovery: data.discovery,
            ui: data.ui,
            matching: data.matching,
            marketVocabulary: data.marketVocabulary,
            searchProviders: data.searchProviders,
            integrationPolicy: data.integrationPolicy,
            profileDefaults: data.profileDefaults,
          }}
        />
      </div>
    </section>
  );
}
