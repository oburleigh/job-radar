import { Switch } from "@job-radar/ui";
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
    <Switch
      checked={optimistic}
      className={`toggle${optimistic ? " toggle-on" : ""}`}
      disabled={pending}
      label={`${optimistic ? "Disable" : "Enable"} ${label}`}
      onCheckedChange={toggle}
    />
  );
}
