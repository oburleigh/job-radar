import { Button, IconButton } from "@job-radar/design-ui";
import { Play, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useFetcher, useLocation, useNavigate, useNavigation, useSearchParams } from "react-router";
import type { ActionState } from "@/contexts/discovery/presentation/web/action-state";
import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";

interface RunControlsProps {
  profile: {
    id: number;
    name: string;
  };
  provider: string;
  providers: {
    name: string;
    label: string;
    configured: boolean;
  }[];
}

export function RunControls({ profile, provider, providers }: RunControlsProps) {
  const syncFetcher = useFetcher<ActionState>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isSelectionPending = navigation.state !== "idle";

  function selectProvider(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("provider", value);
    void navigate(`${pathname}?${params.toString()}`, { replace: true });
  }

  function runDiscovery() {
    setMessage("Starting discovery...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/discovery-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: profile.id, provider }),
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
    <section className="run-controls" aria-label="Discovery controls">
      <span className="run-control-label">02 · Run discovery</span>
      <strong className="run-control-profile">{profile.name}</strong>
      <div className="run-action-row">
        <label className="compact-select">
          <span className="sr-only">Search provider</span>
          <select
            value={provider}
            onChange={(event) => selectProvider(event.target.value)}
            disabled={isPending || isSelectionPending}
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
          busy={isPending || isSelectionPending}
          onClick={runDiscovery}
          disabled={isPending || isSelectionPending || !provider}
          variant="primary"
        >
          <Play size={16} fill="currentColor" />
          {isPending ? "Working..." : "Run discovery"}
        </Button>
        <IconButton
          busy={isPending || isSelectionPending}
          onClick={refreshBoards}
          disabled={isPending || isSelectionPending}
          label="Refresh known boards"
          title="Refresh known boards"
        >
          <RefreshCw size={18} className={isPending ? "spin" : ""} />
        </IconButton>
      </div>
      {message ? <p className="action-message">{message}</p> : null}
    </section>
  );
}
