import { Button, SelectField, TextField } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import {
  type ResearchReasoningEffort,
  researchReasoningEfforts,
} from "@/contexts/recruiter-engagement/domain/research-run";

const reasoningEffortLabels: Readonly<Record<ResearchReasoningEffort, string>> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  xhigh: "Extra high",
};

type ExecutionSettings = RecruiterResearchSettings["execution"];

type SettingsActionState = {
  readonly field?: keyof ExecutionSettings;
  readonly message: string;
  readonly ok: boolean;
};

export function ExecutionSettingsForm({
  action = "/settings/recruiter-search/execution",
  settings,
}: {
  readonly action?: string;
  readonly settings: ExecutionSettings;
}) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  const errorFor = (field: keyof ExecutionSettings) =>
    fetcher.data?.ok === false && fetcher.data.field === field ? fetcher.data.message : undefined;
  const fieldError = (field: keyof ExecutionSettings) => {
    const message = errorFor(field);
    return message ? { error: message } : {};
  };
  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-execution-settings" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Research execution</h2>
            <p>
              Recruiter Search researches firms and recruiters through the Codex CLI installed on
              this machine, signed in to your own plan. Each run freezes these values.
            </p>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <TextField
            defaultValue={settings.model}
            {...fieldError("model")}
            hint="A model identifier the installed Codex CLI accepts, such as gpt-5.6-sol."
            id="recruiter-settings-execution-model"
            label="Model"
            name="model"
            required
            type="text"
          />
          <SelectField
            defaultValue={settings.reasoningEffort}
            {...fieldError("reasoningEffort")}
            hint="Higher effort researches more thoroughly and takes longer."
            id="recruiter-settings-execution-effort"
            label="Reasoning effort"
            name="reasoningEffort"
            required
          >
            {researchReasoningEfforts.map((effort) => (
              <option key={effort} value={effort}>
                {reasoningEffortLabels[effort]}
              </option>
            ))}
          </SelectField>
          <TextField
            defaultValue={settings.stageRequestLimit}
            {...fieldError("stageRequestLimit")}
            hint="One invocation researches a whole stage. The rest of the allowance covers a retry."
            id="recruiter-settings-execution-stage-requests"
            label="Codex invocations per stage"
            min="1"
            name="stageRequestLimit"
            required
            type="number"
          />
          <TextField
            defaultValue={settings.stageTimeoutMs}
            {...fieldError("stageTimeoutMs")}
            hint="A stage abandoned at this point records a Source failure rather than hanging."
            id="recruiter-settings-execution-timeout"
            label="Stage timeout in milliseconds"
            min="1000"
            name="stageTimeoutMs"
            required
            step="1000"
            type="number"
          />
        </div>
      </section>
      <div className="form-submit-row">
        {fetcher.data?.message ? (
          <p className={fetcher.data.ok ? "form-success" : "form-error"}>{fetcher.data.message}</p>
        ) : (
          <span />
        )}
        <Button busy={pending} disabled={pending} type="submit" variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save research execution settings"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
