import { Button, IconButton } from "@job-radar/design-ui";
import { Play, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useFetcher } from "react-router";
import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";
import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";

interface RunControlsProps {
  profileId: number;
  providers: {
    name: string;
    label: string;
    configured: boolean;
  }[];
}

export function RunControls({ profileId, providers }: RunControlsProps) {
  const syncFetcher = useFetcher<ActionState>();
  const [provider, setProvider] = useState(
    providers.find((item) => item.configured)?.name ?? providers[0]?.name ?? "",
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function runDiscovery() {
    setMessage("Starting discovery...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/discovery-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, provider }),
        });
        const result = (await response.json()) as {
          ok: boolean;
          runId?: number;
          message: string;
        };
        setMessage(result.message);
        if (result.ok && result.runId) {
          window.dispatchEvent(
            new CustomEvent(DISCOVERY_RUN_STARTED_EVENT, {
              detail: { runId: result.runId },
            }),
          );
        }
      } catch {
        setMessage(
          "The discovery request did not reach the local app. Reload the page after restarting the app.",
        );
      }
    });
  }

  function refreshBoards() {
    setMessage("");
    startTransition(async () => {
      await syncFetcher.submit({ intent: "sync-boards" }, { method: "post", action: "/sources" });
      if (syncFetcher.data?.message) {
        setMessage(syncFetcher.data.message);
      }
    });
  }

  return (
    <div className="run-controls">
      <span className="run-control-label">02 · Run discovery</span>
      <div className="run-action-row">
        <label className="compact-select">
          <span className="sr-only">Search provider</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            disabled={isPending}
          >
            {providers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
                {item.configured ? "" : " (key missing)"}
              </option>
            ))}
          </select>
        </label>
        <Button
          busy={isPending}
          onClick={runDiscovery}
          disabled={isPending || !provider}
          variant="primary"
        >
          <Play size={16} fill="currentColor" />
          {isPending ? "Working..." : "Run discovery"}
        </Button>
        <IconButton
          busy={isPending}
          onClick={refreshBoards}
          disabled={isPending}
          label="Refresh known boards"
          title="Refresh known boards"
        >
          <RefreshCw size={18} className={isPending ? "spin" : ""} />
        </IconButton>
      </div>
      {message ? <p className="action-message">{message}</p> : null}
    </div>
  );
}
