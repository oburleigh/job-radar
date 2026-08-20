import { RefreshCw } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "./action-state.js";

export function SyncButton() {
  const fetcher = useFetcher<ActionState>();
  const pending = fetcher.state !== "idle";
  const message = fetcher.data?.message ?? "";

  return (
    <div className="inline-action">
      <button
        className="button button-secondary"
        type="button"
        disabled={pending}
        onClick={() =>
          void fetcher.submit({ intent: "sync-boards" }, { method: "post", action: "/sources" })
        }
      >
        <RefreshCw size={17} className={pending ? "spin" : ""} />
        {pending ? "Refreshing..." : "Refresh boards"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
