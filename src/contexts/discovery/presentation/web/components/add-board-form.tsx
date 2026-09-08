import { Button, TextField } from "@job-radar/design-ui";
import { Plus } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

const initialState: ActionState = { ok: false, message: "" };

export function AddBoardForm() {
  const fetcher = useFetcher<ActionState>();
  const state = fetcher.data ?? initialState;
  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      action="/settings/adapters/source-coverage"
      className="add-board-form"
    >
      <input type="hidden" name="intent" value="add-board" />
      <TextField
        id="add-board-company-name"
        label="Company"
        name="companyName"
        placeholder="Optional company name"
      />
      <TextField
        id="add-board-url"
        label="Public ATS job, careers, or board URL"
        name="url"
        placeholder="https://jobs.example-ats.com/company/..."
        required
        type="url"
      />
      <Button type="submit" disabled={pending} busy={pending} variant="primary">
        <Plus size={17} />
        {pending ? "Adding..." : "Add ATS URL"}
      </Button>
      {state.message ? (
        <p className={`board-form-message ${state.ok ? "success" : "error"}`}>{state.message}</p>
      ) : null}
      <small className="board-form-help">
        Known ATS URLs register a board for direct sync. Other public URLs create an enabled
        search-only integration automatically.
      </small>
    </fetcher.Form>
  );
}
