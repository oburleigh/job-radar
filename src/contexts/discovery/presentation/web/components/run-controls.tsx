import { Button } from "@job-radar/design-ui";
import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Link, useLocation, useNavigate, useNavigation, useSearchParams } from "react-router";
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
  activeBoardCount: number;
}

export function RunControls({ profile, provider, providers, activeBoardCount }: RunControlsProps) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isSelectionPending = navigation.state !== "idle";
  const selectedProvider = providers.find((item) => item.name === provider);
  const canRun = activeBoardCount > 0 || selectedProvider?.configured === true;

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
          body: JSON.stringify({
            profileId: profile.id,
            ...(provider ? { provider } : {}),
          }),
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

  return (
    <section className="run-controls" aria-label="Discovery controls">
      <strong className="run-control-profile">{profile.name}</strong>
      <div className="run-action-row">
        {providers.length > 0 ? (
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
        ) : null}
        <Button
          busy={isPending || isSelectionPending}
          onClick={runDiscovery}
          disabled={isPending || isSelectionPending || !canRun}
          variant="primary"
        >
          <Play size={16} fill="currentColor" />
          {isPending ? "Working..." : "Run discovery"}
        </Button>
      </div>
      {!canRun ? (
        <p className="action-message">
          <Link to="/sources">Enable a company board</Link> or configure a web search provider to
          run discovery.
        </p>
      ) : message ? (
        <p className="action-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
