import type { DiscoveryRunOutcome } from "@/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome";

type DiscoveryRunOutcomePresentation = {
  readonly kind: DiscoveryRunOutcome;
  readonly label: string;
  readonly title: string;
  readonly liveRole: "status" | "alert";
};

const presentations: Record<DiscoveryRunOutcome, DiscoveryRunOutcomePresentation> = {
  running: {
    kind: "running",
    label: "Running",
    title: "Discovery is running",
    liveRole: "status",
  },
  completed: {
    kind: "completed",
    label: "Completed",
    title: "Discovery completed",
    liveRole: "status",
  },
  partial: {
    kind: "partial",
    label: "Partial",
    title: "Discovery partially completed",
    liveRole: "alert",
  },
  failed: {
    kind: "failed",
    label: "Failed",
    title: "Discovery failed",
    liveRole: "alert",
  },
  cancelled: {
    kind: "cancelled",
    label: "Cancelled",
    title: "Discovery cancelled",
    liveRole: "status",
  },
};

export function presentDiscoveryRunOutcome(
  outcome: DiscoveryRunOutcome,
): DiscoveryRunOutcomePresentation {
  return presentations[outcome];
}
