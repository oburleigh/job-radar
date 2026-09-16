import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { presentDiscoveryRunOutcome } from "@/contexts/discovery/presentation/web/run-outcome-presentation";
import { opportunityAdvisorContract } from "@/contexts/opportunity-tracking/public-contract.server";
import {
  isActiveResearchRunActivity,
  type ResearchRunActivity,
} from "@/contexts/recruiter-engagement/public-contract";
import { recruiterActivityContract } from "@/contexts/recruiter-engagement/public-contract.server";

export async function loadActivityData() {
  const [discovery, research, advisor] = await Promise.allSettled([
    Promise.resolve().then(() => discoveryWeb.getRunsData()),
    Promise.resolve().then(() => recruiterActivityContract.listResearchRuns()),
    Promise.resolve().then(() =>
      opportunityAdvisorContract.listExecutions(
        discoveryWeb.getRuntimeSettings().discovery.runHistoryLimit,
      ),
    ),
  ]);
  const discoveryRuns = discovery.status === "fulfilled" ? discovery.value : [];
  const researchRuns = research.status === "fulfilled" ? research.value : [];
  const advisorRuns = advisor.status === "fulfilled" ? advisor.value : [];
  return {
    discoveryRuns,
    items: [
      ...discoveryRuns.map(discoveryActivity),
      ...researchRuns.map(researchActivity),
      ...advisorRuns.map(advisorActivity),
    ].toSorted((left, right) => right.startedAt.getTime() - left.startedAt.getTime()),
    errors: [
      ...(discovery.status === "rejected" ? ["Discovery history could not load."] : []),
      ...(research.status === "rejected" ? ["Recruiter Search history could not load."] : []),
      ...(advisor.status === "rejected" ? ["Advisor history could not load."] : []),
    ],
    pollIntervalMs: discoveryWeb.getUiSettings().discoveryPollIntervalMs,
  };
}

export type ActivityItem = Awaited<ReturnType<typeof loadActivityData>>["items"][number];

function advisorActivity(
  run: ReturnType<typeof opportunityAdvisorContract.listExecutions>[number],
) {
  const active = run.status === "running";
  return {
    active,
    href:
      run.kind === "assessment"
        ? `/opportunities/${run.searchProfileId}/${run.jobListingId}`
        : `/applications/${run.applicationId}`,
    id: String(run.id),
    kind: "advisor" as const,
    retryOf: run.retryOf,
    type: run.kind === "assessment" ? "Opportunity assessment" : "Relationship plan",
    startedAt: run.startedAt,
    status: titleCase(run.status.replaceAll("-", " ")),
    scope: `${run.policy.model} · ${run.policy.reasoningEffort} reasoning`,
    outcome: `${run.reason?.replaceAll("-", " ") ?? (active ? "In progress" : "Structured result stored")}${run.finishedAt ? ` · ${run.finishedAt.getTime() - run.startedAt.getTime()} ms` : ""}`,
    tone: active
      ? ("running" as const)
      : run.status === "completed"
        ? ("completed" as const)
        : run.status === "cancelled"
          ? ("cancelled" as const)
          : ("failed" as const),
  };
}

function discoveryActivity(run: ReturnType<typeof discoveryWeb.getRunsData>[number]) {
  const outcome = presentDiscoveryRunOutcome(run.outcome);
  return {
    active: run.status === "running",
    href: `/runs/${run.id}`,
    id: `#${run.id}`,
    kind: "discovery" as const,
    outcome: `${run.jobsUpserted} job writes · ${run.matchesFound} matches`,
    scope: `${run.profileName} · ${run.provider || "No web provider"}`,
    startedAt: run.startedAt,
    status: outcome.label,
    tone: outcome.kind,
    type: "Discovery Run" as const,
  };
}

function researchActivity(run: ResearchRunActivity) {
  const active = isActiveResearchRunActivity(run);
  const status = titleCase(run.status);
  return {
    active,
    href: `/recruiter-search?run=${encodeURIComponent(run.id)}`,
    id: run.id,
    kind: "research" as const,
    outcome: run.completionReason ?? `${run.checkpoint} stage`,
    scope: run.brief.description || run.brief.criteria.specialisms.join(", "),
    startedAt: run.startedAt,
    status,
    tone: active
      ? ("running" as const)
      : run.status === "completed"
        ? ("completed" as const)
        : run.status === "cancelled"
          ? ("cancelled" as const)
          : run.status === "partial"
            ? ("partial" as const)
            : ("failed" as const),
    type: "Research Run" as const,
  };
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
