import { Button, Checkbox, Panel, SelectField, TextField } from "@job-radar/design-ui";
import { type ActionFunctionArgs, useFetcher, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { RuntimeSettingsForm } from "@/contexts/discovery/presentation/web/components/runtime-settings-form";
import { parseRuntimeSettingsRequest } from "@/contexts/discovery/presentation/web/requests/runtime-settings-request";
import { opportunityAdvisorContract } from "@/contexts/opportunity-tracking/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return {
    ...discoveryWeb.getSettingsData(),
    advisorPolicy: opportunityAdvisorContract.policy(),
    advisorReasoningEfforts: opportunityAdvisorContract.reasoningEfforts,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  if (formData.get("intent") === "save-advisor-settings") {
    const parsed = opportunityAdvisorContract.parseSettingsRequest(formData);
    if (!parsed.ok) return parsed;
    opportunityAdvisorContract.saveSettings(parsed.command);
    return {
      ok: true as const,
      message: "Advisor settings saved.",
    };
  }
  const parsed = parseRuntimeSettingsRequest(formData, discoveryWeb.getRuntimeSettings());
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
  const advisorFetcher = useFetcher<typeof action>();
  const savingAdvisor = advisorFetcher.state !== "idle";
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
        <Panel as="section" padding="comfortable">
          <h2>Local Advisor</h2>
          <p>
            When enabled, the local Codex CLI receives the selected Opportunity facts and listing
            URLs. Relationship plans also include existing Prospect evidence. Nothing is sent until
            you request an Opportunity assessment or a Relationship plan.
          </p>
          <advisorFetcher.Form
            method="post"
            key={data.advisorPolicy.policyVersion}
            className="profile-form"
          >
            <input name="intent" type="hidden" value="save-advisor-settings" />
            <Checkbox
              defaultChecked={data.advisorPolicy.enabled}
              description="Allow explicitly requested Opportunity assessments and Relationship plans."
              id="advisor-enabled"
              label="Enable local Advisor"
              name="enabled"
            />
            <div className="form-grid form-grid-two">
              <TextField
                id="advisor-model"
                name="model"
                label="Advisor model"
                required
                defaultValue={data.advisorPolicy.model}
                hint="A model identifier accepted by the installed Codex CLI."
              />
              <SelectField
                id="advisor-reasoning-effort"
                name="reasoningEffort"
                label="Advisor reasoning effort"
                required
                defaultValue={data.advisorPolicy.reasoningEffort}
              >
                {data.advisorReasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="advisor-timeout"
                name="timeoutMs"
                label="Advisor timeout in milliseconds"
                type="number"
                min="1000"
                required
                defaultValue={data.advisorPolicy.timeoutMs}
                hint="Stop an Advisor request after this duration."
              />
              <TextField
                id="advisor-output-limit"
                name="outputLimit"
                label="Advisor output limit"
                type="number"
                min="1"
                required
                defaultValue={data.advisorPolicy.outputLimit}
                hint="Maximum number of characters accepted in a structured reply."
              />
            </div>
            <p>
              Public people in Relationship plans are checked using the configured Recruiter Search
              web-search provider and its request limits.
            </p>
            <p aria-live="polite" role={advisorFetcher.data?.ok === false ? "alert" : "status"}>
              {savingAdvisor ? "Saving Advisor settings." : advisorFetcher.data?.message}
            </p>
            <Button busy={savingAdvisor} type="submit">
              {savingAdvisor ? "Saving Advisor settings" : "Save Advisor settings"}
            </Button>
          </advisorFetcher.Form>
        </Panel>
      </div>
    </section>
  );
}
