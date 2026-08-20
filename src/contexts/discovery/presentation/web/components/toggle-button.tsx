import { Switch } from "@job-radar/design-ui";
import { useOptimistic, useTransition } from "react";
import { useFetcher } from "react-router";

interface ToggleButtonProps {
  id: number;
  enabled: boolean;
  kind: "source" | "board";
  label: string;
}

export function ToggleButton({ id, enabled, kind, label }: ToggleButtonProps) {
  const fetcher = useFetcher();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = !optimistic;
      setOptimistic(next);
      await fetcher.submit(
        {
          intent: kind === "source" ? "toggle-source" : "toggle-board",
          id: String(id),
          enabled: String(next),
        },
        { method: "post", action: "/sources" },
      );
    });
  }

  return (
    <span className="source-toggle">
      <Switch
        checked={optimistic}
        disabled={pending}
        label={`${optimistic ? "Disable" : "Enable"} ${label}`}
        onCheckedChange={toggle}
      />
    </span>
  );
}
