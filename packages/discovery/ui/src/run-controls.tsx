import { Play, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useFetcher } from "react-router";
import type { ActionState } from "./action-state.js";
import { DISCOVERY_RUN_STARTED_EVENT } from "./client-events.js";

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
        <button
          className="button button-primary"
          type="button"
          onClick={runDiscovery}
          disabled={isPending || !provider}
        >
          <Play size={16} fill="currentColor" />
          {isPending ? "Working..." : "Run discovery"}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={refreshBoards}
          disabled={isPending}
          aria-label="Refresh known boards"
          title="Refresh known boards"
        >
          <RefreshCw size={18} className={isPending ? "spin" : ""} />
        </button>
      </div>
      {message ? <p className="action-message">{message}</p> : null}
    </div>
  );
}
