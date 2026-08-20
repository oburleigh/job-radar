import { Button } from "@job-radar/design-ui";
import { Trash2 } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

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
      <Button busy={pending} disabled={pending} onClick={handleDelete} variant="danger">
        <Trash2 size={17} />
        {pending ? "Deleting..." : "Delete profile"}
      </Button>
      {message ? <span className="delete-error">{message}</span> : null}
    </div>
  );
}
