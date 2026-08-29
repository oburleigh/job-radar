import { Button } from "@job-radar/design-ui";
import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Link, useLocation, useNavigate, useNavigation, useSearchParams } from "react-router";
import { DISCOVERY_RUN_STARTED_EVENT } from "@/contexts/discovery/presentation/web/client-events";

interface RunControlsProps {
  profileId: number;
  profiles: {
    id: number;
    name: string;
  }[];
  provider: string;
  providers: {
    name: string;
    label: string;
    configured: boolean;
  }[];
  activeSourceCount: number;
  activeBoardCount: number;
}

export function RunControls({
  profileId,
  profiles,
  provider,
  providers,
  activeSourceCount,
  activeBoardCount,
}: RunControlsProps) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isSelectionPending = navigation.state !== "idle";
  const selectedProvider = providers.find((item) => item.name === provider);
  const canRun = activeBoardCount > 0 || selectedProvider?.configured === true;

  function selectContext(key: "profile" | "provider", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
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
            profileId,
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
      <label className="run-control-field">
        <span>Search profile</span>
        <select
          value={String(profileId)}
          onChange={(event) => selectContext("profile", event.target.value)}
          disabled={isPending || isSelectionPending}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      {providers.length > 0 ? (
        <label className="run-control-field">
          <span>Web search provider</span>
          <select
            value={provider}
            onChange={(event) => selectContext("provider", event.target.value)}
            disabled={isPending || isSelectionPending}
          >
            {providers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
                {item.configured ? "" : " (unavailable)"}
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
      <div className="run-scope-summary">
        <Link to="/sources">
          {activeSourceCount} active source{activeSourceCount === 1 ? "" : "s"} · {activeBoardCount}{" "}
          company board{activeBoardCount === 1 ? "" : "s"}
        </Link>
        {selectedProvider && !selectedProvider.configured && activeBoardCount > 0 ? (
          <span>
            Company boards will run without web search.{" "}
            <Link to={`/settings?profile=${profileId}&provider=${provider}`}>
              Configure {selectedProvider.label}
            </Link>
          </span>
        ) : null}
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
