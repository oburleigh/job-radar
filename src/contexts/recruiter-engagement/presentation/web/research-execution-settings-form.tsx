import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";

type SettingsActionState = {
  readonly field?: "model" | "reasoningEffort";
  readonly message: string;
  readonly ok: boolean;
};

type ResearchExecutionSettingsFormProps = {
  readonly action?: string;
  readonly execution: Pick<RecruiterResearchSettings["execution"], "model" | "reasoningEffort">;
};

export function ResearchExecutionSettingsForm({
  action = "/settings/recruiter-search",
  execution,
}: ResearchExecutionSettingsFormProps) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  const state = fetcher.data;

  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-research-execution-settings" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Local Codex</h2>
            <p>
              This is the supported local research adapter. Empty values use your Codex account
              defaults.
            </p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <label>
            <span>Provider</span>
            <output className="settings-static-value">Local Codex CLI</output>
          </label>
          <label>
            <span>Model</span>
            <input
              aria-invalid={state?.field === "model" || undefined}
              defaultValue={execution.model ?? ""}
              name="model"
              placeholder="Use Codex account default"
            />
          </label>
          <label>
            <span>Reasoning effort</span>
            <input
              aria-invalid={state?.field === "reasoningEffort" || undefined}
              defaultValue={execution.reasoningEffort ?? ""}
              name="reasoningEffort"
              placeholder="Use Codex account default"
            />
          </label>
        </div>
      </section>
      <div className="form-submit-row">
        {state?.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : (
          <span />
        )}
        <Button busy={pending} disabled={pending} type="submit" variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save local Codex settings"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
