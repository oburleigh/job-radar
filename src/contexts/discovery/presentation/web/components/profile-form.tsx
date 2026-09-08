import { Button, Checkbox, TextArea, TextField } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";
import type { LocationOption } from "@/platform/http/location-option";
import { CurrencyCombobox } from "./currency-combobox";
import { LocationCombobox } from "./location-combobox";

interface ProfileFormProps {
  defaults: {
    maximumAgeDays: number;
    minimumScore: number;
    salaryCurrency: string;
  };
  initialLocationOptions?: readonly LocationOption[];
  profile?: {
    id?: number;
    name: string;
    titleTerms: string[];
    locationTerms: string[];
    requiredJobTerms: string[];
    excludedTitleTerms: string[];
    excludedLocationTerms: string[];
    excludedDescriptionTerms: string[];
    includeRemote: boolean;
    includeUnverified: boolean;
    salaryCurrency: string;
    salaryMin: number | null;
    salaryMax: number | null;
    maxAgeDays: number;
    minScore: number;
  };
}

const initialState: ActionState = { ok: false, message: "" };

export function ProfileForm({ profile, defaults, initialLocationOptions }: ProfileFormProps) {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";
  const [locationTerms, setLocationTerms] = useState<readonly string[]>(
    profile?.locationTerms ?? [],
  );
  const [salaryCurrency, setSalaryCurrency] = useState(
    profile?.salaryCurrency ?? defaults.salaryCurrency,
  );
  const locationError =
    !state.ok && state.message.includes("target location") ? state.message : undefined;
  const salaryCurrencyError =
    !state.ok && state.message.toLowerCase().includes("currency") ? state.message : undefined;

  return (
    <fetcher.Form method="post" action="/profiles" className="profile-form">
      <input type="hidden" name="intent" value="save-profile" />
      {profile?.id ? <input type="hidden" name="id" value={profile.id} /> : null}

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Name and thresholds</h2>
            <p>Set the age and score cutoffs used before a role appears.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <TextField
            defaultValue={profile?.name ?? ""}
            id="profile-name"
            label="Profile name"
            name="name"
            placeholder="Example profile name"
            required
          />
          <TextField
            defaultValue={profile?.maxAgeDays ?? defaults.maximumAgeDays}
            id="profile-max-age-days"
            label="Maximum age"
            max="365"
            min="1"
            name="maxAgeDays"
            suffix="days"
            type="number"
          />
          <TextField
            defaultValue={profile?.minScore ?? defaults.minimumScore}
            id="profile-min-score"
            label="Minimum score"
            max="100"
            min="0"
            name="minScore"
            suffix="/ 100"
            type="number"
          />
        </div>
        <div className="form-grid form-grid-three">
          <CurrencyCombobox
            error={salaryCurrencyError}
            name="salaryCurrency"
            onChange={setSalaryCurrency}
            value={salaryCurrency}
          />
          <TextField
            defaultValue={profile?.salaryMin ?? ""}
            id="profile-salary-min"
            label="Preferred salary minimum"
            max="100000000"
            min="1000"
            name="salaryMin"
            placeholder="100000"
            step="1000"
            type="number"
          />
          <TextField
            defaultValue={profile?.salaryMax ?? ""}
            id="profile-salary-max"
            label="Preferred salary maximum"
            max="100000000"
            min="1000"
            name="salaryMax"
            placeholder="150000"
            step="1000"
            type="number"
          />
        </div>
        <p className="field-help">
          Salary is optional and annual. A published range in the same currency must overlap this
          preference. Roles with no usable salary remain eligible.
        </p>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Titles and locations</h2>
            <p>Enter title phrases by line and add each target location separately.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <TextArea
            defaultValue={profile?.titleTerms.join("\n") ?? ""}
            id="profile-title-terms"
            label="Target job titles"
            name="titleTerms"
            placeholder={"Head of Engineering\nVP Engineering"}
            required
            rows={11}
          />
          <LocationCombobox
            error={locationError}
            id="profile-location-terms"
            {...(initialLocationOptions ? { initialOptions: initialLocationOptions } : {})}
            name="locationTerms"
            onChange={setLocationTerms}
            onCountrySelected={(country) => {
              if (salaryCurrency === "") {
                setSalaryCurrency(country.currencyCode);
              }
            }}
            values={locationTerms}
          />
        </div>
        <Checkbox
          defaultChecked={profile?.includeRemote ?? false}
          description="Accept location-agnostic remote jobs. Country-restricted remote roles must still match a target location."
          id="profile-include-remote"
          label="Include remote roles"
          name="includeRemote"
        />
        <Checkbox
          defaultChecked={profile?.includeUnverified ?? false}
          description="Show search-only pages that could not be confirmed through a structured ATS feed."
          id="profile-include-unverified"
          label="Include unverified web-search leads"
          name="includeUnverified"
        />
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Job context</h2>
            <p>
              Require at least one positive keyword when a title could belong to several industries.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <TextArea
            defaultValue={profile?.requiredJobTerms.join("\n") ?? ""}
            id="profilerequired-job-terms"
            label="Required job keywords, one per line"
            name="requiredJobTerms"
            placeholder={"Keyword one\nKeyword two"}
            rows={5}
          />
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Exclusions</h2>
            <p>Reject obvious false positives before scoring.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <TextArea
            defaultValue={profile?.excludedTitleTerms.join("\n") ?? ""}
            id="profileexcluded-title-terms"
            label="Excluded title terms"
            name="excludedTitleTerms"
            placeholder={"Intern\nGraduate\nAssistant"}
            rows={6}
          />
          <TextArea
            defaultValue={profile?.excludedDescriptionTerms.join("\n") ?? ""}
            id="profileexcluded-description-terms"
            label="Excluded job context terms"
            name="excludedDescriptionTerms"
            placeholder={"US only\nSecurity clearance required"}
            rows={6}
          />
          <TextArea
            defaultValue={profile?.excludedLocationTerms.join("\n") ?? ""}
            id="profileexcluded-location-terms"
            label="Excluded location terms"
            name="excludedLocationTerms"
            placeholder={"Canada\nUnited States"}
            rows={6}
          />
        </div>
      </section>

      <div className="form-submit-row">
        {state.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : (
          <span />
        )}
        <Button type="submit" busy={pending} disabled={pending} variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
