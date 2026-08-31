import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

export type LinkedInAdapterReadinessView = {
  readonly accountId: string | null;
  readonly capabilities: {
    readonly connect: boolean;
    readonly message: boolean;
    readonly search: boolean;
  };
  readonly message: string;
  readonly status: "ready" | "attention-required" | "unavailable";
};

type SettingsActionState = {
  readonly field?: "mcpEndpoint";
  readonly message: string;
  readonly ok: boolean;
};

type LinkedInSettingsFormProps = {
  readonly action?: string;
  readonly readiness: LinkedInAdapterReadinessView | null;
  readonly settings: { readonly mcpEndpoint: string | null };
};

export function LinkedInSettingsForm({
  action = "/settings/adapters/linkedin",
  readiness,
  settings,
}: LinkedInSettingsFormProps) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  const state = fetcher.data;
  const status = readinessStatus(readiness);

  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-linkedin-settings" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>LinkedIn MCP</h2>
            <p>
              Connect Job Radar to a LinkedIn MCP server running on this machine. The server owns
              the browser session; Job Radar does not store your LinkedIn credentials.
            </p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <label>
            <span>Local MCP endpoint</span>
            <input
              aria-invalid={state?.field === "mcpEndpoint" || undefined}
              defaultValue={settings.mcpEndpoint ?? ""}
              name="mcpEndpoint"
              placeholder="http://127.0.0.1:8765/mcp"
              type="url"
            />
          </label>
          <label>
            <span>Status</span>
            <output className="settings-static-value">{status.label}</output>
          </label>
          {readiness?.accountId ? (
            <label>
              <span>Account</span>
              <output className="settings-static-value">{readiness.accountId}</output>
            </label>
          ) : null}
        </div>
        <p className="field-help" aria-live="polite">
          {status.message}
        </p>
        <fieldset className="form-grid form-grid-two settings-capabilities">
          <legend className="sr-only">LinkedIn capabilities</legend>
          {(["search", "connect", "message"] as const).map((capability) => (
            <label key={capability}>
              <span>{capitalize(capability)}</span>
              <output className="settings-static-value">
                {readiness?.capabilities[capability] ? "Available" : "Unavailable"}
              </output>
            </label>
          ))}
        </fieldset>
      </section>
      <div className="form-submit-row">
        {state?.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : (
          <span />
        )}
        <Button busy={pending} disabled={pending} type="submit" variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save LinkedIn settings"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function readinessStatus(readiness: LinkedInAdapterReadinessView | null): {
  readonly label: string;
  readonly message: string;
} {
  if (!readiness) {
    return {
      label: "Not configured",
      message: "Enter the loopback endpoint exposed by your local LinkedIn MCP server.",
    };
  }
  const labels = {
    "attention-required": "Sign-in required",
    ready: "Ready",
    unavailable: "Unavailable",
  } as const;
  return { label: labels[readiness.status], message: readiness.message };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
