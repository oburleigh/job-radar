"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { type ActionState, saveRuntimeSettingsAction } from "@/app/actions";
import type { JobRadarConfig } from "@/infrastructure/config/job-radar";

interface RuntimeSettingsFormProps {
  settings: Pick<JobRadarConfig, "network" | "discovery" | "ui" | "matching" | "searchProviders">;
}

const initialState: ActionState = { ok: false, message: "" };

export function RuntimeSettingsForm({ settings }: RuntimeSettingsFormProps) {
  const [state, action, pending] = useActionState(saveRuntimeSettingsAction, initialState);
  const { network, discovery, ui, matching, searchProviders } = settings;

  return (
    <form action={action} className="profile-form">
      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">01</span>
          <div>
            <h2>Network and discovery</h2>
            <p>Control request behavior and how much work each run performs.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <NumberField
            label="Request timeout (ms)"
            name="timeoutMs"
            value={network.timeoutMs}
            min={1000}
            max={120000}
          />
          <NumberField
            label="Requested web results per query"
            name="resultsPerQuery"
            value={discovery.resultsPerQuery}
            min={1}
            max={100}
            help="The provider-specific cap below can reduce this value."
          />
          <label className="form-span-two">
            <span>HTTP user agent</span>
            <input name="userAgent" required defaultValue={network.userAgent} />
          </label>
          <NumberField
            label="Total jobs per discovered board"
            name="boardJobLimit"
            value={discovery.boardJobLimit}
            min={1}
            max={2000}
            help="Direct connectors paginate until this total is reached."
          />
          <NumberField
            label="Web freshness (days)"
            name="searchFreshnessDays"
            value={discovery.searchFreshnessDays}
            min={0}
            max={365}
            help="Use 0 to disable the web-search freshness request."
          />
          <NumberField
            label="Background work batch size"
            name="workYieldBatchSize"
            value={discovery.workYieldBatchSize}
            min={1}
            max={1000}
            help="Yield after this many writes so saving a profile stays responsive during discovery."
          />
          <NumberField
            label="Run history entries"
            name="runHistoryLimit"
            value={discovery.runHistoryLimit}
            min={1}
            max={1000}
            help="Maximum number of completed and in-progress runs shown in Run history."
          />
          <NumberField
            label="Run status polling (ms)"
            name="discoveryPollIntervalMs"
            value={ui.discoveryPollIntervalMs}
            min={1000}
            max={60000}
          />
          <NumberField
            label="Stale run timeout (ms)"
            name="discoveryStaleAfterMs"
            value={ui.discoveryStaleAfterMs}
            min={60000}
            max={3600000}
          />
          <label>
            <span>Title search mode</span>
            <select name="titleSearchMode" defaultValue={discovery.titleSearchMode}>
              <option value="title">Page title only</option>
              <option value="anywhere">Anywhere on page</option>
            </select>
          </label>
        </div>
        <div className="form-grid form-grid-two settings-text-grid">
          <label>
            <span>Structured verification source IDs</span>
            <textarea
              name="structuredVerificationSources"
              rows={4}
              defaultValue={discovery.structuredVerificationSources.join("\n")}
            />
            <small className="field-help">
              Search-only integration IDs that publish schema.org JobPosting data.
            </small>
          </label>
          <label>
            <span>Closed-listing markers</span>
            <textarea
              name="closedListingMarkers"
              required
              rows={4}
              defaultValue={discovery.closedListingMarkers.join("\n")}
            />
            <small className="field-help">
              A listed phrase marks a fetched search-only role as inactive.
            </small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">02</span>
          <div>
            <h2>Match scoring</h2>
            <p>These weights determine whether a fetched job qualifies.</p>
          </div>
        </div>
        <div className="form-grid settings-number-grid">
          <NumberField
            label="Exact title"
            name="exactTitleScore"
            value={matching.exactTitleScore}
          />
          <NumberField
            label="All title tokens"
            name="fullTokenScore"
            value={matching.fullTokenScore}
          />
          <NumberField
            label="Partial title"
            name="partialTokenScore"
            value={matching.partialTokenScore}
          />
          <NumberField
            label="Partial threshold"
            name="partialTokenThreshold"
            value={matching.partialTokenThreshold}
            min={0}
            max={1}
            step="0.05"
          />
          <NumberField label="Location" name="locationScore" value={matching.locationScore} />
          <NumberField label="Remote" name="remoteScore" value={matching.remoteScore} />
          <NumberField
            label="Unknown date"
            name="unknownDateScore"
            value={matching.unknownDateScore}
          />
          <NumberField
            label="Freshness maximum"
            name="freshnessMaxScore"
            value={matching.freshnessMaxScore}
          />
          <NumberField
            label="Freshness minimum"
            name="freshnessMinimumScore"
            value={matching.freshnessMinimumScore}
          />
          <NumberField
            label="Freshness step (days)"
            name="freshnessStepDays"
            value={matching.freshnessStepDays}
            min={1}
            max={365}
          />
        </div>
        <div className="form-grid form-grid-two settings-text-grid">
          <label>
            <span>Ignored title words</span>
            <textarea name="stopWords" rows={6} defaultValue={matching.stopWords.join("\n")} />
          </label>
          <label>
            <span>Generic leadership words</span>
            <textarea
              name="genericTitleTerms"
              required
              rows={6}
              defaultValue={matching.genericTitleTerms.join("\n")}
            />
          </label>
          <label>
            <span>Remote work terms</span>
            <textarea
              name="remoteTerms"
              required
              rows={6}
              defaultValue={matching.remoteTerms.join("\n")}
            />
          </label>
          <label>
            <span>Unrestricted remote phrases</span>
            <textarea
              name="unrestrictedRemotePhrases"
              required
              rows={6}
              defaultValue={matching.unrestrictedRemotePhrases.join("\n")}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">03</span>
          <div>
            <h2>Search providers</h2>
            <p>Provider credentials remain in .env; non-secret defaults live here.</p>
          </div>
        </div>
        <div className="form-grid provider-grid">
          {Object.entries(searchProviders)
            .sort(([, left], [, right]) => left.priority - right.priority)
            .map(([name, provider]) => (
              <div className="provider-settings" key={name}>
                <label>
                  <span>{provider.label} endpoint</span>
                  <input
                    name={`provider:${name}:endpoint`}
                    type="url"
                    required
                    defaultValue={provider.endpoint}
                  />
                </label>
                <NumberField
                  label={`${provider.label} maximum per query`}
                  name={`provider:${name}:maxResults`}
                  value={provider.maxResults}
                  min={1}
                  max={100}
                />
                <label>
                  <span>Title query mode</span>
                  <select
                    name={`provider:${name}:titleSearchMode`}
                    defaultValue={provider.titleSearchMode ?? ""}
                  >
                    <option value="">Use discovery default</option>
                    <option value="title">Page title only</option>
                    <option value="anywhere">Anywhere on page</option>
                  </select>
                </label>
                <small className="field-help">Credential: {provider.apiKeyEnv}</small>
              </div>
            ))}
        </div>
      </section>

      <div className="form-submit-row">
        {state.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : (
          <span />
        )}
        <button type="submit" className="button button-primary" disabled={pending}>
          <Save size={17} />
          {pending ? "Saving..." : "Save runtime settings"}
        </button>
      </div>
    </form>
  );
}

interface NumberFieldProps {
  label: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: string;
  help?: string;
}

function NumberField({
  label,
  name,
  value,
  min = 0,
  max = 100,
  step = "1",
  help,
}: NumberFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        required
        defaultValue={value}
      />
      {help ? <small className="field-help">{help}</small> : null}
    </label>
  );
}
