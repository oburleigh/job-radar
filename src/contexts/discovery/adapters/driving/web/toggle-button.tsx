"use client";

import { useOptimistic, useTransition } from "react";

import { toggleBoardAction, toggleSourceAction } from "./source-actions";

interface ToggleButtonProps {
  id: number;
  enabled: boolean;
  kind: "source" | "board";
  label: string;
}

export function ToggleButton({ id, enabled, kind, label }: ToggleButtonProps) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = !optimistic;
      setOptimistic(next);
      if (kind === "source") {
        await toggleSourceAction(id, next);
      } else {
        await toggleBoardAction(id, next);
      }
    });
  }

  return (
    <button
      className={`toggle${optimistic ? " toggle-on" : ""}`}
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={`${optimistic ? "Disable" : "Enable"} ${label}`}
      disabled={pending}
      onClick={toggle}
    >
      <span />
    </button>
  );
}
