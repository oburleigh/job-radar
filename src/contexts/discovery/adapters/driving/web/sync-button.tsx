"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { syncBoardsAction } from "./actions";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="inline-action">
      <button
        className="button button-secondary"
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncBoardsAction();
            setMessage(result.message);
          })
        }
      >
        <RefreshCw size={17} className={pending ? "spin" : ""} />
        {pending ? "Refreshing..." : "Refresh boards"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
