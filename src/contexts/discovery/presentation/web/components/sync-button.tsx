import { Button } from "@job-radar/design-ui";
import { RefreshCw } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

export function SyncButton() {
  const fetcher = useFetcher<ActionState>();
  const pending = fetcher.state !== "idle";
  const message = fetcher.data?.message ?? "";

  return (
    <div className="inline-action">
      <Button
        busy={pending}
        disabled={pending}
        onClick={() =>
          void fetcher.submit({ intent: "sync-boards" }, { method: "post", action: "/sources" })
        }
      >
        <RefreshCw size={17} className={pending ? "spin" : ""} />
        {pending ? "Refreshing..." : "Refresh boards"}
      </Button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
