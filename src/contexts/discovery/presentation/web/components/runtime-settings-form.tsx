import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { runtimeSettingConstraints } from "@/contexts/discovery/application/runtime-settings/save/constraints";
import type { RuntimeSettings } from "@/contexts/discovery/application/runtime-settings/settings";
import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";
import { CurrencyCombobox } from "./currency-combobox";

interface RuntimeSettingsFormProps {
  settings: RuntimeSettings;
}

const initialState: ActionState = { ok: false, message: "" };

export function RuntimeSettingsForm({ settings }: RuntimeSettingsFormProps) {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";
  const {
    network,
    discovery,
    ui,
    matching,
    marketVocabulary,
    searchProviders,
    integrationPolicy,
    profileDefaults,
  } = settings;
  const limits = runtimeSettingConstraints;
  const [salaryCurrency, setSalaryCurrency] = useState(profileDefaults.salaryCurrency);
  const fieldError = (field: string) =>
    !state.ok && state.field === field ? state.message : undefined;
  const salaryCurrencyError = fieldError("salaryCurrency");

  useEffect(() => {
    if (!state.ok && state.field) {
      document
        .querySelector<HTMLElement>(`[name="${CSS.escape(state.field)}"]:not([type="hidden"])`)
        ?.focus();
    }
  }, [state]);

  return (
    <fetcher.Form method="post" action="/settings" className="profile-form runtime-settings-form">
      <input type="hidden" name="intent" value="save-runtime-settings" />
      <section className="form-section">
        <div className="form-section-copy">
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
            min={limits.timeoutMs.min}
            max={limits.timeoutMs.max}
          />
          <NumberField
            label="Requested web results per query"
            name="resultsPerQuery"
            value={discovery.resultsPerQuery}
            min={limits.resultsPerQuery.min}
            max={limits.resultsPerQuery.max}
            help="The provider-specific cap below can reduce this value."
          />
          <NumberField
            label="Useful hits required for another page"
            name="minimumUsefulHitsPerPage"
            value={discovery.minimumUsefulHitsPerPage}
            min={limits.minimumUsefulHitsPerPage.min}
            max={limits.minimumUsefulHitsPerPage.max}
          />
          <NumberField
            label="Maximum pages per search lane"
            name="maxPagesPerLane"
            value={discovery.maxPagesPerLane}
            min={limits.maxPagesPerLane.min}
            max={limits.maxPagesPerLane.max}
          />
          <NumberField
            label="Maximum requests per run"
            name="maxRequestsPerRun"
            value={discovery.maxRequestsPerRun}
            min={limits.maxRequestsPerRun.min}
            max={limits.maxRequestsPerRun.max}
          />
          <label className="form-span-two">
            <span>HTTP user agent</span>
            <input name="userAgent" required defaultValue={network.userAgent} />
          </label>
          <NumberField
            label="Total jobs per discovered board"
            name="boardJobLimit"
            value={discovery.boardJobLimit}
            min={limits.boardJobLimit.min}
            max={limits.boardJobLimit.max}
            help="Direct board sync continues until this total is reached."
          />
          <NumberField
            label="Web freshness (days)"
            name="searchFreshnessDays"
            value={discovery.searchFreshnessDays}
            min={limits.searchFreshnessDays.min}
            max={limits.searchFreshnessDays.max}
            help="Use 0 to disable the web-search freshness request."
          />
          <NumberField
            label="Background work batch size"
            name="workYieldBatchSize"
            value={discovery.workYieldBatchSize}
            min={limits.workYieldBatchSize.min}
            max={limits.workYieldBatchSize.max}
            help="Yield after this many writes so saving a profile stays responsive during discovery."
          />
          <NumberField
            label="Run history entries"
            name="runHistoryLimit"
            value={discovery.runHistoryLimit}
            min={limits.runHistoryLimit.min}
            max={limits.runHistoryLimit.max}
            help="Maximum number of completed and in-progress runs shown in Run history."
          />
          <NumberField
            label="Run status polling (ms)"
            name="discoveryPollIntervalMs"
            value={ui.discoveryPollIntervalMs}
            min={limits.discoveryPollIntervalMs.min}
            max={limits.discoveryPollIntervalMs.max}
          />
          <NumberField
            label="Stale run timeout (ms)"
            name="discoveryStaleAfterMs"
            value={ui.discoveryStaleAfterMs}
            min={limits.discoveryStaleAfterMs.min}
            max={limits.discoveryStaleAfterMs.max}
          />
          <label>
            <span>Search strategies</span>
            <textarea name="strategies" rows={4} defaultValue={discovery.strategies.join("\n")} />
            <small className="field-help">
              One ordered strategy per line: role-first, location-first, phrase, or relaxed-title.
            </small>
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>Market vocabulary (JSON)</span>
            <textarea
              className="code-field"
              name="marketVocabulary"
              required
              rows={14}
              defaultValue={JSON.stringify(marketVocabulary, null, 2)}
              aria-invalid={Boolean(fieldError("marketVocabulary"))}
              aria-describedby={
                fieldError("marketVocabulary") ? "marketVocabulary-error" : undefined
              }
            />
            {fieldError("marketVocabulary") ? (
              <small id="marketVocabulary-error" className="field-error">
                {fieldError("marketVocabulary")}
              </small>
            ) : (
              <small className="field-help">
                Country aliases and configured descendants widen country targets. Cities and
                subdivisions stay narrow.
              </small>
            )}
          </label>
        </div>
        <fieldset className="form-grid settings-subsection">
          <legend>Provider execution</legend>
          <p className="field-help">
            Bound simultaneous requests, request rate, and transient-failure retries for each search
            provider.
          </p>
          <div className="form-grid form-grid-three settings-subsection-grid">
            <NumberField
              label="Provider concurrency"
              name="providerConcurrency"
              value={discovery.providerExecution.concurrency}
              min={limits.providerConcurrency.min}
              max={limits.providerConcurrency.max}
              help="Maximum requests running at once for each search provider."
              error={fieldError("providerConcurrency")}
            />
            <NumberField
              label="Requests per interval"
              name="providerRequestsPerInterval"
              value={discovery.providerExecution.requestsPerInterval}
              min={limits.providerRequestsPerInterval.min}
              max={limits.providerRequestsPerInterval.max}
              help="Maximum request starts within the adjacent request interval."
              error={fieldError("providerRequestsPerInterval")}
            />
            <NumberField
              label="Request interval (ms)"
              name="providerIntervalMs"
              value={discovery.providerExecution.intervalMs}
              min={limits.providerIntervalMs.min}
              max={limits.providerIntervalMs.max}
              error={fieldError("providerIntervalMs")}
            />
            <NumberField
              label="Maximum provider attempts"
              name="providerMaxAttempts"
              value={discovery.providerExecution.maxAttempts}
              min={limits.providerMaxAttempts.min}
              max={limits.providerMaxAttempts.max}
              help="Includes the first request. Fatal failures always stop after one attempt."
              error={fieldError("providerMaxAttempts")}
            />
            <NumberField
              label="First retry delay (ms)"
              name="providerRetryMinDelayMs"
              value={discovery.providerExecution.retryMinDelayMs}
              min={limits.providerRetryMinDelayMs.min}
              max={limits.providerRetryMinDelayMs.max}
              error={fieldError("providerRetryMinDelayMs")}
            />
            <NumberField
              label="Maximum retry delay (ms)"
              name="providerRetryMaxDelayMs"
              value={discovery.providerExecution.retryMaxDelayMs}
              min={limits.providerRetryMaxDelayMs.min}
              max={limits.providerRetryMaxDelayMs.max}
              error={fieldError("providerRetryMaxDelayMs")}
            />
            <NumberField
              label="Maximum retry time (ms)"
              name="providerRetryMaxTimeMs"
              value={discovery.providerExecution.retryMaxTimeMs}
              min={limits.providerRetryMaxTimeMs.min}
              max={limits.providerRetryMaxTimeMs.max}
              help="Stops a retry sequence even when attempts remain."
              error={fieldError("providerRetryMaxTimeMs")}
            />
          </div>
        </fieldset>
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
            min={limits.partialTokenThreshold.min}
            max={limits.partialTokenThreshold.max}
            step={String(limits.partialTokenThreshold.step)}
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
            min={limits.freshnessStepDays.min}
            max={limits.freshnessStepDays.max}
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
                  min={limits.providerMaxResults.min}
                  max={limits.providerMaxResults.max}
                />
                <label>
                  <span>Strategy override</span>
                  <textarea
                    name={`provider:${name}:strategies`}
                    rows={4}
                    defaultValue={provider.strategies?.join("\n") ?? ""}
                  />
                  <small className="field-help">Leave blank to use the discovery order.</small>
                </label>
                <label>
                  <span>Market locations (JSON)</span>
                  <textarea
                    name={`provider:${name}:marketLocations`}
                    rows={7}
                    defaultValue={JSON.stringify(provider.marketLocations, null, 2)}
                  />
                </label>
                <small className="field-help">Credential: {provider.apiKeyEnv}</small>
              </div>
            ))}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>New profile defaults</h2>
            <p>Choose the starting values used when you create a search profile.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <NumberField
            label="Maximum age (days)"
            name="maximumAgeDays"
            value={profileDefaults.maximumAgeDays}
            min={limits.maximumAgeDays.min}
            max={limits.maximumAgeDays.max}
          />
          <NumberField
            label="Minimum match score"
            name="minimumScore"
            value={profileDefaults.minimumScore}
            min={limits.minimumScore.min}
            max={limits.minimumScore.max}
          />
          <CurrencyCombobox
            error={salaryCurrencyError}
            name="salaryCurrency"
            onChange={setSalaryCurrency}
            value={salaryCurrency}
          />
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>ATS registry defaults</h2>
            <p>Set the ordering used when Job Radar creates a search-only integration.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <NumberField
            label="New integration priority"
            name="customIntegrationPriority"
            value={integrationPolicy.customPriority}
            min={limits.customIntegrationPriority.min}
            max={limits.customIntegrationPriority.max}
          />
        </div>
      </section>

      <div className="form-submit-row">
        {state.message ? (
          <p
            className={state.ok ? "form-success" : "form-error"}
            role={state.ok ? "status" : "alert"}
          >
            {state.message}
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" busy={pending} disabled={pending} variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save runtime settings"}
        </Button>
      </div>
    </fetcher.Form>
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
  error?: string | undefined;
}

function NumberField({
  label,
  name,
  value,
  min = 0,
  max = 100,
  step = "1",
  help,
  error,
}: NumberFieldProps) {
  const inputId = runtimeSettingFieldId(name);
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = [help ? helpId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");
  return (
    <label htmlFor={inputId}>
      <span>{label}</span>
      <input
        aria-describedby={describedBy || undefined}
        aria-invalid={Boolean(error)}
        id={inputId}
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        required
        defaultValue={value}
      />
      {help ? (
        <small className="field-help" id={helpId}>
          {help}
        </small>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </label>
  );
}

function runtimeSettingFieldId(name: string): string {
  return `runtime-setting-${name.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}
