import { Button, SelectField } from "@job-radar/design-ui";
import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Link, useLocation, useNavigate, useNavigation, useSearchParams } from "react-router";
import { dispatchDiscoveryRunStart } from "@/contexts/discovery/presentation/web/client-events";

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
    const requestId = crypto.randomUUID();
    const profileName =
      profiles.find((profile) => profile.id === profileId)?.name ?? `Profile ${profileId}`;
    dispatchDiscoveryRunStart({
      state: "starting",
      requestId,
      profileId,
      profileName,
    });
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
          dispatchDiscoveryRunStart({ state: "accepted", requestId, runId: result.runId });
        } else {
          dispatchDiscoveryRunStart({ state: "rejected", requestId });
        }
      } catch {
        dispatchDiscoveryRunStart({ state: "rejected", requestId });
        setMessage(
          "The discovery request did not reach the local app. Reload the page after restarting the app.",
        );
      }
    });
  }

  return (
    <section className="run-controls" aria-label="Discovery controls">
      <SelectField
        disabled={isPending || isSelectionPending}
        id="opportunity-search-profile"
        label="Search profile"
        onChange={(event) => selectContext("profile", event.target.value)}
        value={String(profileId)}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </SelectField>
      {providers.length > 0 ? (
        <SelectField
          disabled={isPending || isSelectionPending}
          id="opportunity-search-provider"
          label="Web search provider"
          onChange={(event) => selectContext("provider", event.target.value)}
          value={provider}
        >
          {providers.map((item) => (
            <option key={item.name} value={item.name}>
              {item.label}
              {item.configured ? "" : " (unavailable)"}
            </option>
          ))}
        </SelectField>
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
        <Link to="/settings/adapters/source-coverage">
          {activeSourceCount} active source{activeSourceCount === 1 ? "" : "s"} · {activeBoardCount}{" "}
          company board{activeBoardCount === 1 ? "" : "s"}
        </Link>
        {selectedProvider && !selectedProvider.configured && activeBoardCount > 0 ? (
          <span>
            Company boards will run without web search.{" "}
            <Link to="/settings/opportunities">Configure {selectedProvider.label}</Link>
          </span>
        ) : null}
      </div>
      {!canRun ? (
        <p className="action-message">
          <Link to="/settings/adapters/source-coverage">Enable a company board</Link> or configure a
          web search provider to run discovery.
        </p>
      ) : message ? (
        <p className="action-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
