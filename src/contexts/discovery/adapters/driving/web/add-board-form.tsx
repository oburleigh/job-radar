"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import type { ActionState } from "./action-state";
import { addBoardAction } from "./source-actions";

const initialState: ActionState = { ok: false, message: "" };

export function AddBoardForm() {
  const [state, action, pending] = useActionState(addBoardAction, initialState);

  return (
    <form action={action} className="add-board-form">
      <label>
        <span>Company</span>
        <input name="companyName" placeholder="Optional company name" />
      </label>
      <label className="board-url-field">
        <span>Public ATS job, careers, or board URL</span>
        <input
          name="url"
          type="url"
          required
          placeholder="https://jobs.example-ats.com/company/..."
        />
      </label>
      <button className="button button-primary" type="submit" disabled={pending}>
        <Plus size={17} />
        {pending ? "Adding..." : "Add ATS URL"}
      </button>
      {state.message ? (
        <p className={`board-form-message ${state.ok ? "success" : "error"}`}>{state.message}</p>
      ) : null}
      <small className="board-form-help">
        Known ATS URLs register a board for direct sync. Other public URLs create an enabled
        search-only integration automatically.
      </small>
    </form>
  );
}
