import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";
import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

interface IntegrationSettingsFormProps {
  integration: {
    atsType: string;
    label: string;
    searchPatterns: string[];
    hostnames: string[];
    hostSuffixes: string[];
    supportsBoardSync: boolean;
    priority: number;
    pageSize: number | null;
    endpoints: Record<string, string>;
  };
  isNew?: boolean;
  canConfigureSync?: boolean;
}

const initialState: ActionState = { ok: false, message: "" };

export function IntegrationSettingsForm({
  integration,
  isNew = false,
  canConfigureSync = true,
}: IntegrationSettingsFormProps) {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      action="/settings"
      className="profile-form"
      key={integration.atsType}
    >
      <input type="hidden" name="intent" value="save-integration" />
      <input type="hidden" name="isNew" value={isNew ? "1" : "0"} />
      {isNew ? null : <input type="hidden" name="atsType" value={integration.atsType} />}

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">01</span>
          <div>
            <h2>Search coverage</h2>
            <p>Patterns are used to build targeted web search queries.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          {isNew ? (
            <label>
              <span>Integration ID</span>
              <input
                name="atsType"
                required
                pattern="[a-z][a-z0-9-]{1,39}"
                placeholder="teamtailor"
              />
              <small className="field-help">
                Lowercase letters, numbers, and hyphens. This cannot be renamed.
              </small>
            </label>
          ) : null}
          <label>
            <span>Display name</span>
            <input name="label" required defaultValue={integration.label} />
          </label>
          <label>
            <span>Priority</span>
            <input
              name="priority"
              type="number"
              min="0"
              max="10000"
              required
              defaultValue={integration.priority}
            />
          </label>
          <label className="form-span-two">
            <span>Source patterns, one per line</span>
            <textarea
              name="searchPatterns"
              rows={6}
              required
              defaultValue={integration.searchPatterns.join("\n")}
              placeholder="jobs.example-ats.com"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <span className="form-step">02</span>
          <div>
            <h2>URL recognition</h2>
            <p>Exact hosts and suffixes determine which ATS owns a result.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <label>
            <span>Exact hostnames</span>
            <textarea name="hostnames" rows={6} defaultValue={integration.hostnames.join("\n")} />
          </label>
          <label>
            <span>Hostname suffixes</span>
            <textarea
              name="hostSuffixes"
              rows={6}
              defaultValue={integration.hostSuffixes.join("\n")}
            />
          </label>
        </div>
      </section>

      {canConfigureSync ? (
        <section className="form-section">
          <div className="form-section-copy">
            <span className="form-step">03</span>
            <div>
              <h2>Direct board sync</h2>
              <p>Endpoint templates accept placeholders such as {"{slug}"}.</p>
            </div>
          </div>
          <div className="form-grid form-grid-two">
            <label>
              <span>API page size</span>
              <input
                name="pageSize"
                type="number"
                min="1"
                max="1000"
                defaultValue={integration.pageSize ?? ""}
              />
              <small className="field-help">
                This is not the board limit. The connector paginates up to the global jobs-per-board
                total.
              </small>
            </label>
            <label>
              <span>Endpoint templates</span>
              <textarea
                className="code-field"
                name="endpoints"
                rows={Math.max(6, Object.keys(integration.endpoints).length + 2)}
                defaultValue={JSON.stringify(integration.endpoints, null, 2)}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="supportsBoardSync"
              defaultChecked={integration.supportsBoardSync}
            />
            <span>
              <strong>Enable direct board sync</strong>
              Fetch structured jobs after a company board has been discovered.
            </span>
          </label>
        </section>
      ) : (
        <section className="form-section">
          <input type="hidden" name="pageSize" value="" />
          <input type="hidden" name="endpoints" value="{}" />
          <div className="form-section-copy">
            <span className="form-step">03</span>
            <div>
              <h2>Search-only integration</h2>
              <p>
                Results are saved as unverified leads. Direct board sync needs a connector that
                understands this ATS feed.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="form-submit-row">
        {state.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : (
          <span />
        )}
        <Button type="submit" busy={pending} disabled={pending} variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : isNew ? "Add integration" : `Save ${integration.label}`}
        </Button>
      </div>
    </fetcher.Form>
  );
}
