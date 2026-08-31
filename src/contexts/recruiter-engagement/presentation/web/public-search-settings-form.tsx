import { Button, SelectField } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";

type ProviderOption = {
  readonly configured: boolean;
  readonly label: string;
  readonly name: string;
};

type SettingsActionState = {
  readonly field?: keyof RecruiterResearchSettings["publicSearch"];
  readonly message: string;
  readonly ok: boolean;
};

export function PublicSearchSettingsForm({
  action = "/settings/recruiter-search",
  providers,
  settings,
}: {
  readonly action?: string;
  readonly providers: readonly ProviderOption[];
  readonly settings: RecruiterResearchSettings["publicSearch"];
}) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  const providerError =
    fetcher.data?.ok === false && fetcher.data.field === "providerName"
      ? fetcher.data.message
      : undefined;
  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-public-search-settings" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Public search</h2>
            <p>
              Choose the configured web provider used to find recruitment firms and public recruiter
              profiles. Each run freezes this choice and its request budget.
            </p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <SelectField
            defaultValue={settings.providerName}
            {...(providerError ? { error: providerError } : {})}
            id="recruiter-settings-search-provider"
            label="Search provider"
            name="providerName"
            required
          >
            {providers.map((provider) => (
              <option disabled={!provider.configured} key={provider.name} value={provider.name}>
                {provider.label}
                {provider.configured ? "" : " (not configured)"}
              </option>
            ))}
          </SelectField>
          <NumberField
            label="Results per request"
            name="resultsPerQuery"
            value={settings.resultsPerQuery}
          />
          <NumberField
            label="Pages per query"
            name="maxPagesPerQuery"
            value={settings.maxPagesPerQuery}
          />
          <NumberField
            label="Requests per stage"
            name="stageRequestLimit"
            value={settings.stageRequestLimit}
          />
        </div>
        <details className="settings-disclosure">
          <summary>Query and evidence terms</summary>
          <p className="field-help">
            One value per line. These terms shape provider queries and classify the returned public
            evidence; they are not embedded in application code.
          </p>
          <div className="form-grid form-grid-two">
            <TermField
              label="Firm discovery phrases"
              name="firmDiscoveryPhrases"
              values={settings.firmDiscoveryPhrases}
            />
            <TermField
              label="Recruiter role terms"
              name="recruiterRoleTerms"
              values={settings.recruiterRoleTerms}
            />
            <TermField
              label="Current activity terms"
              name="currentActivityTerms"
              values={settings.currentActivityTerms}
            />
            <TermField
              label="Named recruiter or team terms"
              name="namedRecruiterOrTeamTerms"
              values={settings.namedRecruiterOrTeamTerms}
            />
            <TermField
              label="Scale or track record terms"
              name="scaleOrTrackRecordTerms"
              values={settings.scaleOrTrackRecordTerms}
            />
            <TermField
              label="Public profile source paths"
              name="profileSourceHosts"
              values={settings.profileSourceHosts}
            />
            <TermField
              label="Excluded result hosts"
              name="excludedHosts"
              values={settings.excludedHosts}
            />
          </div>
        </details>
      </section>
      <div className="form-submit-row">
        {fetcher.data?.message ? (
          <p className={fetcher.data.ok ? "form-success" : "form-error"}>{fetcher.data.message}</p>
        ) : (
          <span />
        )}
        <Button busy={pending} disabled={pending} type="submit" variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save public search settings"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function NumberField({
  label,
  name,
  value,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input defaultValue={value} min="1" name={name} required type="number" />
    </label>
  );
}

function TermField({
  label,
  name,
  values,
}: {
  readonly label: string;
  readonly name: string;
  readonly values: readonly string[];
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea defaultValue={values.join("\n")} name={name} rows={4} />
    </label>
  );
}
