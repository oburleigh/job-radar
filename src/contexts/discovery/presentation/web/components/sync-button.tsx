import { IconButton } from "@job-radar/design-ui";
import { RefreshCw } from "lucide-react";
import { useFetcher } from "react-router";

import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";

export function SyncButton() {
  const fetcher = useFetcher<ActionState>();
  const pending = fetcher.state !== "idle";
  const message = fetcher.data?.message ?? "";

  return (
    <div className="inline-action">
      <IconButton
        busy={pending}
        label="Refresh board registry"
        onClick={() =>
          void fetcher.submit(
            { intent: "sync-boards" },
            { method: "post", action: "/settings/adapters/source-coverage" },
          )
        }
        title="Refresh board registry"
      >
        <RefreshCw size={17} className={pending ? "spin" : ""} />
      </IconButton>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
