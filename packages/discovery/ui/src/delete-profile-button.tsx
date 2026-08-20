import { Trash2 } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "./action-state.js";

interface DeleteProfileButtonProps {
  profileId: number;
  profileName: string;
}

export function DeleteProfileButton({ profileId, profileName }: DeleteProfileButtonProps) {
  const fetcher = useFetcher<ActionState>();
  const pending = fetcher.state !== "idle";
  const message = fetcher.data?.message ?? "";

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${profileName}" and its saved runs, matches, and job statuses?`,
    );
    if (!confirmed) {
      return;
    }

    void fetcher.submit(
      { intent: "delete-profile", profileId: String(profileId) },
      { method: "post", action: "/profiles" },
    );
  }

  return (
    <div className="delete-profile-control">
      <button
        type="button"
        className="button button-danger"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 size={17} />
        {pending ? "Deleting..." : "Delete profile"}
      </button>
      {message ? <span className="delete-error">{message}</span> : null}
    </div>
  );
}
