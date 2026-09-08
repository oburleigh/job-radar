import { Button, Checkbox, TextArea, TextField } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

interface IntegrationSettingsFormProps {
  formAction: string;
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
  formAction,
  integration,
  isNew = false,
  canConfigureSync = true,
}: IntegrationSettingsFormProps) {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";
  const integrationIdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) {
      integrationIdRef.current?.focus();
    }
  }, [isNew]);

  return (
    <fetcher.Form
      method="post"
      action={formAction}
      className="profile-form"
      key={integration.atsType}
    >
      <input type="hidden" name="intent" value="save-integration" />
      <input type="hidden" name="isNew" value={isNew ? "1" : "0"} />
      {isNew ? null : <input type="hidden" name="atsType" value={integration.atsType} />}

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Search coverage</h2>
            <p>Patterns are used to build targeted web search queries.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          {isNew ? (
            <TextField
              hint="Lowercase letters, numbers, and hyphens. This cannot be renamed."
              id="integration-ats-type"
              label="Integration ID"
              name="atsType"
              pattern="[a-z][a-z0-9-]{1,39}"
              placeholder="teamtailor"
              ref={integrationIdRef}
              required
            />
          ) : null}
          <TextField
            defaultValue={integration.label}
            id="integration-label"
            label="Display name"
            name="label"
            required
          />
          <TextField
            defaultValue={integration.priority}
            id="integration-priority"
            label="Priority"
            max="10000"
            min="0"
            name="priority"
            required
            type="number"
          />
          <div className="form-span-two">
            <TextArea
              defaultValue={integration.searchPatterns.join("\n")}
              id="integration-search-patterns"
              label="Source patterns, one per line"
              name="searchPatterns"
              placeholder="jobs.example-ats.com"
              required
              rows={6}
            />
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>URL recognition</h2>
            <p>Exact hosts and suffixes determine which ATS owns a result.</p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <TextArea
            defaultValue={integration.hostnames.join("\n")}
            id="integration-hostnames"
            label="Exact hostnames"
            name="hostnames"
            rows={6}
          />
          <TextArea
            defaultValue={integration.hostSuffixes.join("\n")}
            id="integration-host-suffixes"
            label="Hostname suffixes"
            name="hostSuffixes"
            rows={6}
          />
        </div>
      </section>

      {canConfigureSync ? (
        <section className="form-section">
          <div className="form-section-copy">
            <div>
              <h2>Direct board sync</h2>
              <p>Endpoint templates accept placeholders such as {"{slug}"}.</p>
            </div>
          </div>
          <div className="form-grid form-grid-two">
            <TextField
              defaultValue={integration.pageSize ?? ""}
              hint="This is not the board limit. Direct sync paginates up to the global jobs-per-board total."
              id="integration-page-size"
              label="API page size"
              max="1000"
              min="1"
              name="pageSize"
              type="number"
            />
            <TextArea
              className="code-field"
              defaultValue={JSON.stringify(integration.endpoints, null, 2)}
              id="integration-endpoints"
              label="Endpoint templates"
              name="endpoints"
              rows={Math.max(6, Object.keys(integration.endpoints).length + 2)}
            />
          </div>
          <Checkbox
            defaultChecked={integration.supportsBoardSync}
            description="Fetch structured jobs after a company board has been discovered."
            id="integration-supports-board-sync"
            label="Enable direct board sync"
            name="supportsBoardSync"
          />
        </section>
      ) : (
        <section className="form-section">
          <input type="hidden" name="pageSize" value="" />
          <input type="hidden" name="endpoints" value="{}" />
          <div className="form-section-copy">
            <div>
              <h2>Search-only integration</h2>
              <p>
                Results are saved as unverified leads. Direct board sync needs support for this ATS
                feed.
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
