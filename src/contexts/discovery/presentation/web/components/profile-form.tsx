import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

interface ProfileFormProps {
  defaults: {
    maximumAgeDays: number;
    minimumScore: number;
    salaryCurrency: string;
  };
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

export function ProfileForm({ profile, defaults }: ProfileFormProps) {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" action="/profiles" className="profile-form">
      <input type="hidden" name="intent" value="save-profile" />
      {profile?.id ? <input type="hidden" name="id" value={profile.id} /> : null}

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">01</span>
          <div>
            <h2>Name and thresholds</h2>
            <p>Set the age and score cutoffs used before a role appears.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <label>
            <span>Profile name</span>
            <input
              name="name"
              required
              defaultValue={profile?.name ?? ""}
              placeholder="UAE engineering leadership"
            />
          </label>
          <label>
            <span>Maximum age</span>
            <div className="input-suffix">
              <input
                name="maxAgeDays"
                type="number"
                min="1"
                max="365"
                defaultValue={profile?.maxAgeDays ?? defaults.maximumAgeDays}
              />
              <span>days</span>
            </div>
          </label>
          <label>
            <span>Minimum score</span>
            <div className="input-suffix">
              <input
                name="minScore"
                type="number"
                min="0"
                max="100"
                defaultValue={profile?.minScore ?? defaults.minimumScore}
              />
              <span>/ 100</span>
            </div>
          </label>
        </div>
        <div className="form-grid form-grid-three">
          <label>
            <span>Salary currency</span>
            <input
              name="salaryCurrency"
              maxLength={3}
              pattern="[A-Za-z]{3}"
              defaultValue={profile?.salaryCurrency ?? defaults.salaryCurrency}
              placeholder="GBP"
            />
          </label>
          <label>
            <span>Preferred salary minimum</span>
            <input
              name="salaryMin"
              type="number"
              min="1000"
              max="100000000"
              step="1000"
              defaultValue={profile?.salaryMin ?? ""}
              placeholder="100000"
            />
          </label>
          <label>
            <span>Preferred salary maximum</span>
            <input
              name="salaryMax"
              type="number"
              min="1000"
              max="100000000"
              step="1000"
              defaultValue={profile?.salaryMax ?? ""}
              placeholder="150000"
            />
          </label>
        </div>
        <p className="field-help">
          Salary is optional and annual. A published range in the same currency must overlap this
          preference. Roles with no usable salary remain eligible.
        </p>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">02</span>
          <div>
            <h2>Titles and locations</h2>
            <p>Enter one term per line. Exact phrases score highest.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <label>
            <span>Target job titles</span>
            <textarea
              name="titleTerms"
              required
              rows={11}
              defaultValue={profile?.titleTerms.join("\n") ?? ""}
              placeholder={"Head of Engineering\nVP Engineering"}
            />
          </label>
          <label>
            <span>Target locations</span>
            <textarea
              name="locationTerms"
              required
              rows={11}
              defaultValue={profile?.locationTerms.join("\n") ?? ""}
              placeholder={"Dubai\nAbu Dhabi\nUnited Arab Emirates"}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="includeRemote"
            defaultChecked={profile?.includeRemote ?? false}
          />
          <span>
            <strong>Include remote roles</strong>
            Accept location-agnostic remote jobs. Country-restricted remote roles must still match a
            target location.
          </span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="includeUnverified"
            defaultChecked={profile?.includeUnverified ?? false}
          />
          <span>
            <strong>Include unverified web-search leads</strong>
            Show search-only pages that could not be confirmed through a structured ATS feed.
          </span>
        </label>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">03</span>
          <div>
            <h2>Job context</h2>
            <p>
              Require at least one positive keyword when a title could belong to several industries.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            <span>Required job keywords, one per line</span>
            <textarea
              name="requiredJobTerms"
              rows={5}
              defaultValue={profile?.requiredJobTerms.join("\n") ?? ""}
              placeholder={"Software\nTechnology\nPlatform\nCloud"}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">04</span>
          <div>
            <h2>Exclusions</h2>
            <p>Reject obvious false positives before scoring.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <label>
            <span>Excluded title terms</span>
            <textarea
              name="excludedTitleTerms"
              rows={6}
              defaultValue={profile?.excludedTitleTerms.join("\n") ?? ""}
              placeholder={"Intern\nGraduate\nAssistant"}
            />
          </label>
          <label>
            <span>Excluded job context terms</span>
            <textarea
              name="excludedDescriptionTerms"
              rows={6}
              defaultValue={profile?.excludedDescriptionTerms.join("\n") ?? ""}
              placeholder={"US only\nSecurity clearance required"}
            />
          </label>
          <label>
            <span>Excluded location terms</span>
            <textarea
              name="excludedLocationTerms"
              rows={6}
              defaultValue={profile?.excludedLocationTerms.join("\n") ?? ""}
              placeholder={"Canada\nUnited States"}
            />
          </label>
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
