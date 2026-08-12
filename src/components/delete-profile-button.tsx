"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteProfileAction } from "@/app/actions";

interface DeleteProfileButtonProps {
  profileId: number;
  profileName: string;
}

export function DeleteProfileButton({ profileId, profileName }: DeleteProfileButtonProps) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function deleteProfile() {
    const confirmed = window.confirm(
      `Delete "${profileName}" and its saved runs, matches, and job statuses?`,
    );
    if (!confirmed) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await deleteProfileAction(profileId);
        setMessage(result.message);
      } catch {
        setMessage("The delete request did not reach the local app.");
      }
    });
  }

  return (
    <div className="delete-profile-control">
      <button
        type="button"
        className="button button-danger"
        disabled={pending}
        onClick={deleteProfile}
      >
        <Trash2 size={17} />
        {pending ? "Deleting..." : "Delete profile"}
      </button>
      {message ? <span className="delete-error">{message}</span> : null}
    </div>
  );
}
