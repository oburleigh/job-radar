import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

export type RevalidationState = "idle" | "loading";

// Nobody is reading a page they cannot see, and a revalidation scheduled behind one that has not
// come back stacks requests on a synchronous database.
export function shouldSchedulePoll(input: {
  readonly enabled: boolean;
  readonly documentIsVisible: boolean;
  readonly revalidationState: RevalidationState;
}): boolean {
  return input.enabled && input.documentIsVisible && input.revalidationState === "idle";
}

// Reschedules after each revalidation settles rather than on a fixed interval, so the gap between
// polls is the gap the caller asked for rather than the gap minus however long the last one took.
export function useRevalidationPoll(enabled: boolean, intervalMs: number): void {
  const revalidator = useRevalidator();
  const documentIsVisible = useDocumentIsVisible();
  const scheduled = shouldSchedulePoll({
    documentIsVisible,
    enabled,
    revalidationState: revalidator.state === "idle" ? "idle" : "loading",
  });

  useEffect(() => {
    if (!scheduled) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void revalidator.revalidate();
    }, intervalMs);
    return () => window.clearTimeout(timeout);
  }, [intervalMs, revalidator, scheduled]);
}

function useDocumentIsVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const read = () => setVisible(document.visibilityState !== "hidden");
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  return visible;
}
