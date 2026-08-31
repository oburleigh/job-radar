import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";

type SettingsActionState = {
  readonly field?: keyof RecruiterResearchSettings["criteriaOptions"];
  readonly message: string;
  readonly ok: boolean;
};

export function ResearchCriteriaOptionsForm({
  action = "/settings/recruiter-search",
  options,
}: {
  readonly action?: string;
  readonly options: RecruiterResearchSettings["criteriaOptions"];
}) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-research-criteria-options" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Research criteria</h2>
            <p>Manage the choices offered when setting a Recruiter Search market focus.</p>
          </div>
        </div>
        <details className="settings-disclosure">
          <summary>Edit industries and Specialisms</summary>
          <p className="field-help">
            These catalogues supply the choices on Recruiter Search. Enter one value per line.
          </p>
          <div className="form-grid form-grid-two">
            <CatalogueField
              {...optionalError(fieldError(fetcher.data, "industries"))}
              label="Target industries"
              name="industries"
              values={options.industries}
            />
            <CatalogueField
              {...optionalError(fieldError(fetcher.data, "specialisms"))}
              label="Specialisms"
              name="specialisms"
              values={options.specialisms}
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
          {pending ? "Saving..." : "Save Research criteria"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function fieldError(
  state: SettingsActionState | undefined,
  field: keyof RecruiterResearchSettings["criteriaOptions"],
): string | undefined {
  return state?.ok === false && state.field === field ? state.message : undefined;
}

function optionalError(error: string | undefined): { readonly error?: string } {
  return error ? { error } : {};
}

function CatalogueField({
  error,
  label,
  name,
  values,
}: {
  readonly error?: string;
  readonly label: string;
  readonly name: keyof RecruiterResearchSettings["criteriaOptions"];
  readonly values: readonly string[];
}) {
  const errorId = `${name}-catalogue-error`;
  return (
    <label>
      <span>{label}</span>
      <textarea
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        defaultValue={values.join("\n")}
        name={name}
        required
        rows={8}
      />
      {error ? (
        <small className="jr-field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}
